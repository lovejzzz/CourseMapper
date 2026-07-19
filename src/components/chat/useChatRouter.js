import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { classifyFindings } from '../../lib/pedagogicalValidator';
import { getChatOpener, resolveLabel } from './constants';
import { saveConversation, newConversationId } from '../../lib/chatPersistence';
import { getSystemPrompt, streamChat } from './useStreamProcessor';
import useProposalHandler from './useProposalHandler';
import { runAgentLoop } from './useToolInvoker';
import { handleAgentFinalResponse as _handleAgentFinalResponse } from './useChatMessages';
import { useAIConfig } from '../../contexts/AIConfigContext';
import { AGENT_TOOLS } from '../../lib/agentTools';
import { getAgentUnavailableMessage, isAgentProviderReady } from '../../lib/agentAvailability';
import { createCustomToolRegistry, mergeCloudCustomTools, parseExportedTool } from '../../lib/customAgentTools';
import { saveCustomTool, deleteCustomTool } from '../../lib/cloudStorage';
import { AGENT_EXECUTION_MODES, AGENT_EXECUTION_MODE_STORAGE_KEY } from '../../lib/agentExecutionMode';
import { buildAgentSourceContextMessage } from '../../lib/agentSourceContext';
import { getScionAgentFailureMessage } from '../../lib/scionUserFacingError';

// ═══════════════════════════════════════════════════════════════════════════
// useChatRouter — Unified hook for Ask (help AI) + Revise (agent/revision)
// ═══════════════════════════════════════════════════════════════════════════
export function prepareEditAndResendMessages(messages, msgIndex, newText) {
  const trimmed = (newText || '').trim();
  if (!trimmed) return null;
  if (!messages[msgIndex] || messages[msgIndex].role !== 'user') return null;
  return {
    history: messages.slice(0, msgIndex),
    text: trimmed,
  };
}

export function prepareAutoReviewSend(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('[AUTO-REVIEW]')) {
    return { text: trimmed, agentPromptOverride: null, silent: false };
  }
  return {
    text: 'Review my course',
    agentPromptOverride: trimmed,
    silent: true,
  };
}

export function resolveChatRoute({ courseMap, hasDeliverables, isGenerating, hasExecutor } = {}) {
  if (isGenerating) return 'help';
  if ((hasDeliverables || courseMap) && hasExecutor) return 'agent';
  if (courseMap) return 'revision';
  return 'help';
}

export function buildRetryFailedPrompt(failedItems, toolName) {
  if (!Array.isArray(failedItems) || failedItems.length === 0) return '';
  const lines = failedItems
    .map((f, i) => {
      const feature = f.featureId ? resolveLabel(f.featureId) : 'course map';
      const lesson = typeof f.lessonIndex === 'number' ? ` (Lesson ${f.lessonIndex + 1})` : '';
      const inputBlob = f.originalInput ? `\n    Previous args: ${JSON.stringify(f.originalInput)}` : '';
      return `${i + 1}. ${f.action} on ${feature}${lesson} — failed: ${f.message}${inputBlob}`;
    })
    .join('\n');
  const tool = toolName === 'edit_course_map' ? 'edit_course_map' : 'edit_deliverables';
  return (
    `[RETRY-FAILED] A previous ${tool} call partially failed. The applied changes should stay; ` +
    `only retry the failures below, correcting whatever caused each error (bad lessonIndex, missing required ` +
    `field, duplicate content, not-generated deliverable, etc). After retrying, respond() briefly confirming ` +
    `what now succeeded and what couldn't be fixed and why.\n\n${lines}`
  );
}

export function formatAttachedFileContents(files) {
  return (Array.isArray(files) ? files : [])
    .filter((file) => file?.text)
    .map((file) => `=== Attached File: ${file.name} ===\n${file.text}`)
    .join('\n\n');
}

export function buildAttachedFilePrompt(text, files) {
  const fileContents = formatAttachedFileContents(files);
  if (!fileContents) return text;
  return text
    ? `${text}\n\nThe user also attached these additional reference files:\n\n${fileContents}`
    : `Please incorporate the following additional reference files:\n\n${fileContents}`;
}

export function buildAttachedFileDisplayText(text, files) {
  const count = Array.isArray(files) ? files.length : 0;
  const base = text?.trim() || 'Attached reference files';
  if (count === 0) return base;
  return `${base} [+${count} file${count > 1 ? 's' : ''}]`;
}

export default function useChatRouter({
  courseMap,
  activeTab,
  slideTheme,
  onRevision,
  onDeliverableRevision,
  isStopped,
  onResume,
  savedMessages,
  onMessagesChange,
  // Agent params
  deliverables,
  selectedFeatures,
  columns,
  deliverableConfig,
  lessonScope,
  executeAction,
  optimisticUpdate,
  delivUndoSnapshot,
  delivUndoFn,
  executeSyncPlan,
  notifyEdit,
  uid,
  onApiCallEvent,
  viewportRef = null,
}) {
  const { apiKey, provider, modelId, apiStatus } = useAIConfig();
  const [messages, setMessages] = useState(savedMessages || []);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  function setStreaming(val) {
    isStreamingRef.current = val;
    setIsStreaming(val);
  }
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(null);
  const [agentExecutionMode, setAgentExecutionModeState] = useState(AGENT_EXECUTION_MODES.APPLY);
  const agentDryRun = agentExecutionMode === AGENT_EXECUTION_MODES.DRY_RUN;
  const setAgentDryRun = useCallback((enabled) => {
    const nextMode = enabled ? AGENT_EXECUTION_MODES.DRY_RUN : AGENT_EXECUTION_MODES.APPLY;
    setAgentExecutionModeState(nextMode);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(AGENT_EXECUTION_MODE_STORAGE_KEY, nextMode);
    } catch {
      /* persistence is best-effort */
    }
  }, []);

  // Sync messages to parent for persistence
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
  });
  useEffect(() => {
    if (onMessagesChangeRef.current) onMessagesChangeRef.current(messages);
    // Intentionally excludes onMessagesChangeRef: the ref is updated in the preceding
    // effect so the callback is always current. Including it would cause an infinite loop
    // if the parent doesn't memoize onMessagesChange.
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save conversation to persistence layer
  const conversationIdRef = useRef(newConversationId());
  useEffect(() => {
    const visibleCount = messages.filter((m) => m.role === 'user' || m.role === 'assistant').length;
    if (visibleCount >= 2) {
      saveConversation(conversationIdRef.current, messages);
    }
  }, [messages]);

  // Keep fresh refs for values used in callbacks
  const executeActionRef = useRef(executeAction);
  useEffect(() => {
    executeActionRef.current = executeAction;
  });
  // Session-scoped registry for agent-created macros (create_tool / run_tool).
  // Hydrates from localStorage on mount so macros survive refreshes.
  // `uid` may arrive asynchronously (after Firebase auth resolves) — capture it
  // via a ref so the cloud-sync callback always uses the latest value without
  // rebuilding the registry.
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);
  // A version counter lets us re-render the CustomToolsMenu when the registry
  // mutates. The registry itself lives in a ref (stable identity), but the
  // React tree needs a dependency to re-read its contents.
  const [customToolsVersion, setCustomToolsVersion] = useState(0);
  // Cloud-sync status surfaces to the UI via a "not synced" pill so users can
  // tell when local writes failed to propagate (permission errors, network
  // drops, etc). Each failure is tagged with the tool name + operation so the
  // UI can show what didn't stick.
  const [customToolSyncError, setCustomToolSyncError] = useState(null);
  const customToolRegistryRef = useRef(null);
  if (!customToolRegistryRef.current) {
    customToolRegistryRef.current = createCustomToolRegistry({
      onCloudSync: (tool, op) => {
        setCustomToolsVersion((v) => v + 1);
        const currentUid = uidRef.current;
        if (!currentUid) return; // anonymous: localStorage only, no remote sync to track
        const promise =
          op === 'save'
            ? saveCustomTool(currentUid, tool)
            : op === 'delete'
              ? deleteCustomTool(currentUid, tool.name)
              : Promise.resolve();
        promise
          .then(() => {
            // Clear any prior error once a subsequent write succeeds.
            setCustomToolSyncError((prev) => (prev && prev.name === tool.name ? null : prev));
          })
          .catch((err) => {
            setCustomToolSyncError({
              name: tool.name,
              op,
              message: err?.message || 'Cloud sync failed',
              at: Date.now(),
            });
          });
      },
    });
  }
  // One-shot cloud merge on sign-in — pulls any tools created on other devices.
  const mergedForUidRef = useRef(null);
  useEffect(() => {
    if (!uid || mergedForUidRef.current === uid) return;
    mergedForUidRef.current = uid;
    mergeCloudCustomTools(uid)
      .then(() => setCustomToolsVersion((v) => v + 1))
      .catch(() => {});
  }, [uid]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customTools = useMemo(() => customToolRegistryRef.current.list(), [customToolsVersion]);
  const deleteCustomToolByName = useCallback((name) => {
    customToolRegistryRef.current.delete(name);
  }, []);
  // Import a macro from a pasted JSON snippet. Returns {ok, error?} so the
  // CustomToolsMenu can render a per-attempt error without any global toast.
  const importCustomTool = useCallback((jsonText) => {
    const parsed = parseExportedTool(jsonText);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const existingToolNames = new Set(Object.keys(AGENT_TOOLS));
    const res = customToolRegistryRef.current.register(parsed.def, { existingToolNames });
    return res;
  }, []);
  const delivRef = useRef(deliverables);
  useEffect(() => {
    delivRef.current = deliverables;
  });
  const courseMapRef = useRef(courseMap);
  useEffect(() => {
    courseMapRef.current = courseMap;
  });
  const optimisticUpdateRef = useRef(optimisticUpdate);
  useEffect(() => {
    optimisticUpdateRef.current = optimisticUpdate;
  });
  const snapshotRef = useRef(delivUndoSnapshot);
  useEffect(() => {
    snapshotRef.current = delivUndoSnapshot;
  });
  const undoFnRef = useRef(delivUndoFn);
  useEffect(() => {
    undoFnRef.current = delivUndoFn;
  });
  const executeSyncPlanRef = useRef(executeSyncPlan);
  useEffect(() => {
    executeSyncPlanRef.current = executeSyncPlan;
  });
  const notifyEditRef = useRef(notifyEdit);
  useEffect(() => {
    notifyEditRef.current = notifyEdit;
  });
  const agentProviderReady = isAgentProviderReady({ provider, apiKey, apiStatus, modelId });

  function appendAgentUnavailableMessage(text, { silent = false } = {}) {
    const message = getAgentUnavailableMessage({ provider, modelId, apiStatus });
    if (silent) {
      setMessages((prev) => [...prev, { role: 'assistant', text: message }]);
      return;
    }
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: message }]);
  }

  // ── Post-action pedagogical validation ────────────────────────────────────
  // Disabled: validation is available on-demand via the "Review" button.
  // Auto-validation after every edit was too noisy and disruptive.
  function maybeRunValidation() {
    // no-op — users can trigger validation manually
  }

  // ── File handling ─────────────────────────────────────────────────────────
  const processFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setIsParsing(true);
    try {
      const parsed = await parseFiles(files);
      const successful = parsed.filter((f) => f.text);
      if (successful.length > 0) setAttachedFiles((prev) => [...prev, ...successful]);
      const failed = parsed.filter((f) => f.error);
      if (failed.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'error',
            text: `Could not parse: ${failed.map((f) => f.name).join(', ')}`,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', text: `File parse error: ${err.message}` }]);
    }
    setIsParsing(false);
  }, []);

  function removeAttached(idx) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function send(text, options = {}) {
    let trimmed = text.trim();
    const displayTextOverride =
      typeof options.displayText === 'string' && options.displayText.trim() ? options.displayText.trim() : null;
    const agentPromptOverride =
      typeof options.agentPromptOverride === 'string' && options.agentPromptOverride.trim()
        ? options.agentPromptOverride.trim()
        : null;
    if ((!trimmed && !agentPromptOverride && attachedFiles.length === 0) || isStreamingRef.current) return;

    // Dismiss any pending or failed proposals
    setMessages((prev) =>
      prev.map((m) =>
        m.role === 'proposal' && (m.status === 'pending' || m.status === 'failed') ? { ...m, status: 'dismissed' } : m,
      ),
    );

    // Resume stopped generation
    if (courseMap && isStopped && onResume && attachedFiles.length === 0) {
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }, { role: 'assistant', text: 'Resuming...' }]);
      onResume();
      return;
    }

    const preparedSend = prepareAutoReviewSend(trimmed);
    trimmed = preparedSend.text;

    // Auto-route: agent (deliverables exist) → revision (course map only) → help (no course)
    // SAFETY: never enter agent mode while any deliverable is still generating —
    // agent edits could corrupt mid-stream deliverables.
    const delivKeys = delivRef.current ? Object.keys(delivRef.current).filter((k) => k !== 'courseMap') : [];
    const hasDeliverables = delivKeys.some((k) => delivRef.current[k]?.status === 'done');
    const isGenerating = delivKeys.some((k) => delivRef.current[k]?.status === 'generating');

    if (preparedSend.silent && (!hasDeliverables || isGenerating || !executeActionRef.current)) {
      return;
    }

    const chatRoute = resolveChatRoute({
      courseMap,
      hasDeliverables,
      isGenerating,
      hasExecutor: Boolean(executeActionRef.current),
    });

    if (chatRoute === 'agent') {
      if (!agentProviderReady) {
        if (!preparedSend.silent) appendAgentUnavailableMessage(displayTextOverride || trimmed);
        return;
      }
      await sendAgentMessage(trimmed, {
        agentPromptOverride: agentPromptOverride || preparedSend.agentPromptOverride,
        displayTextOverride,
        silent: preparedSend.silent,
        dryRunOverride: options.forceApplyMode ? false : options.dryRunOverride,
      });
    } else if (chatRoute === 'help') {
      // Deliverables are being generated — use help mode only (no edits)
      await sendHelpMessage(trimmed);
    } else {
      await sendRevision(trimmed);
    }
  }

  // ── Ask mode: stream from help AI ─────────────────────────────────────────
  async function sendHelpMessage(text) {
    const filesForThisTurn = attachedFiles;
    const fullText = buildAttachedFilePrompt(text, filesForThisTurn);
    const displayText = buildAttachedFileDisplayText(text, filesForThisTurn);
    const sourceContextMessage = filesForThisTurn.length > 0 ? buildAgentSourceContextMessage(filesForThisTurn) : null;
    if (filesForThisTurn.length > 0) setAttachedFiles([]);

    const userMsg = { role: 'user', content: fullText };
    const newMessages = [
      ...messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: m.text || m.content || '',
        })),
      userMsg,
    ];

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: displayText },
      ...(sourceContextMessage ? [sourceContextMessage] : []),
      { role: 'assistant', text: '' },
    ]);
    setStreaming(true);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const chatMessages = newMessages.slice(-20);
      const systemPrompt = getSystemPrompt(courseMap, activeTab);
      const { reader, parseChunk } = await streamChat(
        chatMessages,
        systemPrompt,
        controller.signal,
        apiKey,
        provider,
        modelId,
      );

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const chunk = parseChunk(parsed);
            if (chunk) {
              fullText += chunk;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', text: fullText };
                return updated;
              });
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.text) return prev.slice(0, -1);
          if (last?.role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, text: last.text + '\n\n*(stopped)*' };
            return updated;
          }
          return prev;
        });
        return;
      }
      const isNoKey = err.message === 'NO_API_KEY';
      const isNoModel = err.message === 'NO_MODEL_SELECTED';
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the help chat, please configure your AI provider and API key first.'
            : isNoModel
              ? 'No AI model selected. Please select a model on the landing page first.'
              : provider === 'public'
                ? "Scion couldn't answer locally. Check the Scion runtime message and try again."
                : "Sorry, I couldn't process that. Please check your API key and try again.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  // ── Shared context object for extracted modules ──────────────────────────
  // Built lazily on each call so refs are always current.
  function buildSharedCtx() {
    return {
      messages,
      setMessages,
      setStreaming,
      abortRef,
      apiKey,
      provider,
      modelId,
      courseMap: courseMapRef.current,
      activeTab,
      slideTheme,
      selectedFeatures,
      columns,
      deliverableConfig,
      lessonFilter: lessonScope?.type === 'specific' ? lessonScope.indices : null,
      delivRef,
      executeActionRef,
      optimisticUpdateRef,
      snapshotRef,
      undoFnRef,
      notifyEditRef,
      uid,
      agentExecutionMode,
      customToolRegistryRef,
      maybeRunValidation,
      viewportRef,
      sendAgentMessage,
      onApiCallEvent,
      handleAgentFinalResponse: (response) => _handleAgentFinalResponse(response, buildSharedCtx()),
    };
  }

  // ── Agent mode: multi-step agentic loop (delegated to useToolInvoker) ────
  async function sendAgentMessage(
    text,
    { silent = false, agentPromptOverride = null, displayTextOverride = null, dryRunOverride = null } = {},
  ) {
    if (!agentProviderReady) {
      appendAgentUnavailableMessage(displayTextOverride || text, { silent });
      return;
    }

    const filesForThisTurn = !silent ? attachedFiles : [];
    const fullMessage = buildAttachedFilePrompt(agentPromptOverride || text, filesForThisTurn);
    const sourceContextMessage = filesForThisTurn.length > 0 ? buildAgentSourceContextMessage(filesForThisTurn) : null;
    const visibleText = displayTextOverride || text;
    const displayText = buildAttachedFileDisplayText(visibleText, filesForThisTurn);

    if (!silent) setAttachedFiles([]);

    const progressStartedAt = Date.now();
    const progressCard = {
      id: `agent-progress-${progressStartedAt}`,
      role: 'agentProgress',
      steps: [],
      status: 'running',
      startedAt: progressStartedAt,
      runMeta: {
        mode: (dryRunOverride ?? agentDryRun) ? 'No workspace edits' : 'Agent run',
        target: resolveLabel(activeTab || 'courseMap'),
        provider,
        model: modelId,
      },
    };

    // Add user message + agentProgress card (silent mode: no user bubble)
    if (silent) {
      setMessages((prev) => [...prev, progressCard]);
    } else {
      const userMessage = { role: 'user', text: displayText };
      if (agentPromptOverride) userMessage.agentPromptOverride = agentPromptOverride;
      setMessages((prev) => [
        ...prev,
        userMessage,
        ...(sourceContextMessage ? [sourceContextMessage] : []),
        progressCard,
      ]);
    }
    setStreaming(true);

    await runAgentLoop(fullMessage, { silent, dryRun: dryRunOverride ?? agentDryRun }, buildSharedCtx());
  }

  // ── Proposal / diff review (delegated to useProposalHandler) ─────────────
  const { handleSelectProposal, handleAcceptDiff, handleRejectDiff } = useProposalHandler({
    courseMap,
    delivRef,
    executeActionRef,
    setMessages,
    messagesRef,
    sendAgentMessage,
    maybeRunValidation,
  });

  // ── Revise mode (legacy): pass to revision handler ────────────────────────
  async function sendRevision(text) {
    const filesForThisTurn = attachedFiles;
    const fullMessage = buildAttachedFilePrompt(text, filesForThisTurn);
    const displayText = buildAttachedFileDisplayText(text, filesForThisTurn);
    const sourceContextMessage = filesForThisTurn.length > 0 ? buildAgentSourceContextMessage(filesForThisTurn) : null;

    setAttachedFiles([]);
    // Use updater to avoid stale messages closure
    let chatHistorySnapshot;
    setMessages((prev) => {
      const updated = [
        ...prev,
        { role: 'user', text: displayText },
        ...(sourceContextMessage ? [sourceContextMessage] : []),
      ];
      chatHistorySnapshot = updated.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-10);
      return updated;
    });

    const isDeliverableTab = activeTab && activeTab !== 'courseMap';
    const delivHasData = isDeliverableTab && delivRef.current?.[activeTab]?.status === 'done';
    const handler = isDeliverableTab && delivHasData && onDeliverableRevision ? onDeliverableRevision : onRevision;

    try {
      const result = await handler(fullMessage, chatHistorySnapshot);
      const assistantReply = result?.chatReply || 'Updated! Review the changes in the workspace.';
      setMessages((prev) => [...prev, { role: 'assistant', text: assistantReply }]);
    } catch (err) {
      const message = provider === 'public' ? getScionAgentFailureMessage(err) : `Failed: ${err.message}`;
      setMessages((prev) => [...prev, { role: 'error', text: message }]);
    }
  }

  // ── Stop streaming ────────────────────────────────────────────────────────
  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  // ── Add progress card (called by ChatPanel when generation status changes)
  // Deduplicates: won't add a card if one with the same phase already exists
  function addProgressMessage(data) {
    setMessages((prev) => {
      const phase = data?.data?.phase;
      if (phase) {
        const alreadyExists = prev.some((m) => m.role === 'progress' && m.data?.phase === phase);
        if (alreadyExists) return prev;
      }
      return [...prev, { role: 'progress', ...data }];
    });
  }

  function addLocalMessages(nextMessages) {
    const safeMessages = Array.isArray(nextMessages) ? nextMessages.filter(Boolean) : [nextMessages].filter(Boolean);
    if (safeMessages.length === 0) return;
    setMessages((prev) => [...prev, ...safeMessages]);
  }

  function updateLocalMessage(match, updater) {
    if (typeof updater !== 'function') return;
    setMessages((prev) => {
      const updated = [...prev];
      const matcher =
        typeof match === 'function'
          ? match
          : (message) => {
              if (!match || typeof match !== 'object') return false;
              if (match.id && message?.id === match.id) return true;
              if (match.role && message?.role === match.role) return true;
              return false;
            };
      for (let i = updated.length - 1; i >= 0; i--) {
        if (!matcher(updated[i], i)) continue;
        const next = updater(updated[i], i);
        if (!next) return prev;
        updated[i] = next;
        return updated;
      }
      return prev;
    });
  }

  // ── Sync suggestion methods (agent-mediated sync) ─────────────────────────
  const pushSyncSuggestion = useCallback((suggestion) => {
    setMessages((prev) => {
      // Replace existing pending syncSuggestion (debounce coalescing)
      const existingIdx = prev.findIndex((m) => m.role === 'syncSuggestion' && m.status === 'pending');
      const newMsg = { role: 'syncSuggestion', ...suggestion, status: 'pending' };
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = newMsg;
        return updated;
      }
      return [...prev, newMsg];
    });
  }, []);

  const handleApproveSyncSuggestion = useCallback(async (suggestionId, selectedPlan = null) => {
    // Read plan from current messages before mutating state
    let plan, changedFieldsSummary, matchMsg;
    const currentMsgs = messagesRef.current;
    matchMsg = currentMsgs.find((m) => m.id === suggestionId);
    if (matchMsg) {
      plan = matchMsg.plan;
      changedFieldsSummary = matchMsg.changedFieldsSummary;
    }

    // Use selectedPlan if provided (per-deliverable selection), otherwise use full plan
    const effectivePlan = selectedPlan || plan;

    setMessages((prev) => prev.map((m) => (m.id === suggestionId ? { ...m, status: 'syncing' } : m)));

    if (!effectivePlan) return;

    try {
      const completed = await executeSyncPlanRef.current?.(effectivePlan, changedFieldsSummary || '');
      const completedFeatureIds = Array.isArray(completed)
        ? [...completed]
        : Array.isArray(completed?.completedFeatureIds)
          ? completed.completedFeatureIds
          : [];
      const completedIds = new Set(completedFeatureIds);
      const failed = effectivePlan.filter((p) => !completedIds.has(p.featureId));
      const result = {
        status: failed.length > 0 ? (completedFeatureIds.length > 0 ? 'partialFail' : 'failed') : 'done',
        suggestion: matchMsg || null,
        selectedPlan: effectivePlan,
        completedFeatureIds,
        failedItems: failed,
        changedFieldsSummary: changedFieldsSummary || '',
        syncSummary: completed?.syncSummary || null,
      };

      if (failed.length > 0 && completedFeatureIds.length > 0) {
        // Partial failure — some succeeded, some didn't
        setMessages((prev) =>
          prev.map((m) =>
            m.id === suggestionId ? { ...m, status: 'partialFail', failedItems: failed, completedFeatureIds } : m,
          ),
        );
      } else if (failed.length > 0) {
        // All failed
        setMessages((prev) =>
          prev.map((m) => (m.id === suggestionId ? { ...m, status: 'partialFail', failedItems: failed } : m)),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === suggestionId ? { ...m, status: 'done', completedFeatureIds } : m)),
        );
      }
      return result;
    } catch {
      const failedPlan = Array.isArray(effectivePlan) ? effectivePlan : [];
      setMessages((prev) =>
        prev.map((m) => (m.id === suggestionId ? { ...m, status: 'partialFail', failedItems: failedPlan } : m)),
      );
      return {
        status: 'failed',
        suggestion: matchMsg || null,
        selectedPlan: failedPlan,
        completedFeatureIds: [],
        failedItems: failedPlan,
        changedFieldsSummary: changedFieldsSummary || '',
        syncSummary: null,
      };
    }
  }, []);

  const handleSkipSyncSuggestion = useCallback((suggestionId) => {
    setMessages((prev) => prev.map((m) => (m.id === suggestionId ? { ...m, status: 'skipped' } : m)));
  }, []);

  // ── Health Gate: auto-fix + skip ──────────────────────────────────────────

  /** Trigger agent auto-fix loop for health findings.
   *  @param {Array} findingsArg — if provided, use directly (silent mode). Otherwise read from healthGate card.
   */
  function triggerAutoFix(findingsArg) {
    let findings = findingsArg || [];

    // Fallback: read from healthGate card in messages (legacy / button-click path)
    if (findings.length === 0) {
      const currentMsgs = messagesRef.current;
      const gateMsg = currentMsgs.find((m) => m.role === 'progress' && m.data?.phase === 'healthGate');
      if (gateMsg) {
        findings = gateMsg.data?.findings || [];
        setMessages((prev) => {
          const gateIdx = prev.findIndex((m) => m.role === 'progress' && m.data?.phase === 'healthGate');
          if (gateIdx < 0) return prev;
          const updated = [...prev];
          updated[gateIdx] = { ...updated[gateIdx], data: { ...updated[gateIdx].data, status: 'fixing' } };
          return updated;
        });
      }
    }

    if (findings.length === 0) return;

    const { autoFixable, needsDecision } = classifyFindings(findings);

    // Build the synthetic safe-repair prompt.
    const parts = ['[SAFE REPAIR LOOP] The course health check found the following issues. Fix them now.\n'];

    if (autoFixable.length > 0) {
      parts.push(`## Auto-fixable issues (fix directly via edit_deliverables, NO proposal needed):`);
      autoFixable.forEach((f, i) => {
        parts.push(`${i + 1}. [${f.severity}] ${f.message}${f.suggestedPrompt ? ` — Hint: ${f.suggestedPrompt}` : ''}`);
      });
    }

    if (needsDecision.length > 0) {
      parts.push(`\n## Issues needing user decision (create proposals with 2-3 options):`);
      needsDecision.forEach((f, i) => {
        parts.push(`${i + 1}. [${f.severity}] ${f.message}${f.suggestedPrompt ? ` — Hint: ${f.suggestedPrompt}` : ''}`);
      });
    }

    parts.push(
      '\nAfter fixing, run validate_course to verify improvements. Summarize what was fixed and what needs user decisions.',
    );

    const prompt = parts.join('\n');
    sendAgentMessage(prompt, { silent: true });
  }

  // ── Retry failed / Keep applied for partial-failure changeSummary cards ──
  /**
   * Build a targeted silent follow-up so the agent retries the exact patches
   * that failed, with the error messages inline so it knows what to correct.
   */
  function retryFailedEdits(msgIndex, failedItems, toolName) {
    if (!Array.isArray(failedItems) || failedItems.length === 0) return;
    const prompt = buildRetryFailedPrompt(failedItems, toolName);
    // Mark the card as retrying so the UI updates immediately.
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex && m.role === 'changeSummary' ? { ...m, status: 'retried' } : m)),
    );
    sendAgentMessage(prompt, { silent: true });
  }

  /** Dismiss the failure panel — kept successes stay, no state mutation. */
  function keepAppliedChanges(msgIndex) {
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex && m.role === 'changeSummary' ? { ...m, status: 'kept' } : m)),
    );
  }

  /** Skip health gate and show normal completion card */
  function skipHealthGate(completionData) {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.role === 'progress' && m.data?.phase === 'healthGate' ? { ...m, data: { ...m.data, status: 'skipped' } } : m,
      );

      // Add the normal completion card with greeting/starters
      const opener = getChatOpener(courseMap, true, activeTab, delivRef.current);
      updated.push({
        role: 'progress',
        data: {
          ...completionData,
          phase: 'complete',
          greeting: opener.greeting,
          starters: opener.starters,
        },
      });

      return updated;
    });
  }

  // ── Edit and resend: replace a user message text and remove everything after it
  function editAndResend(msgIndex, newText) {
    if (isStreamingRef.current) return;
    const msgs = messagesRef.current;
    const prepared = prepareEditAndResendMessages(msgs, msgIndex, newText);
    if (!prepared) return;
    // Remove all messages from this index onward, then re-send with new text
    messagesRef.current = prepared.history;
    setMessages(prepared.history);
    send(prepared.text);
  }

  // ── Regenerate: re-send the user message that preceded a given assistant message
  function regenerate(msgIndex) {
    if (isStreamingRef.current) return;
    const msgs = messagesRef.current;
    // Find preceding user message
    let userIdx = msgIndex - 1;
    while (userIdx >= 0 && msgs[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userText = msgs[userIdx].text || msgs[userIdx].content || '';
    if (!userText) return;
    const userAgentPromptOverride = msgs[userIdx].agentPromptOverride || null;
    // Remove the old assistant message
    setMessages((prev) => prev.filter((_, i) => i !== msgIndex));
    // Re-send
    send(
      userText,
      userAgentPromptOverride
        ? {
            displayText: userText,
            agentPromptOverride: userAgentPromptOverride,
          }
        : {},
    );
  }

  // ── Feedback: toggle thumbs up/down on an assistant message
  function feedback(msgIndex, vote) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = updated[msgIndex];
      if (!msg || msg.role !== 'assistant') return prev;
      updated[msgIndex] = { ...msg, feedback: msg.feedback === vote ? null : vote };
      return updated;
    });
  }

  return {
    messages,
    isStreaming,
    send,
    handleStop,
    attachedFiles,
    processFiles,
    removeAttached,
    isParsing,
    addProgressMessage,
    addLocalMessages,
    updateLocalMessage,
    handleSelectProposal,
    handleAcceptDiff,
    handleRejectDiff,
    pushSyncSuggestion,
    handleApproveSyncSuggestion,
    handleSkipSyncSuggestion,
    triggerAutoFix,
    skipHealthGate,
    editAndResend,
    regenerate,
    feedback,
    // Agent-created macros (create_tool / run_tool) — surfaced to the ChatPanel
    // header so users can see, delete, export, and import them.
    customTools,
    deleteCustomTool: deleteCustomToolByName,
    importCustomTool,
    customToolSyncError,
    isAgentProviderReady: agentProviderReady,
    agentDryRun,
    setAgentDryRun,
    // Partial-failure recovery on changeSummary cards
    retryFailedEdits,
    keepAppliedChanges,
  };
}
