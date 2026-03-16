import { useState, useRef, useEffect, useCallback } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { classifyFindings } from '../../lib/pedagogicalValidator';
import { getChatOpener } from './constants';
import { saveConversation, newConversationId } from '../../lib/chatPersistence';
import {
  getSystemPrompt, streamChat,
} from './useStreamProcessor';
import useProposalHandler from './useProposalHandler';
import { runAgentLoop } from './useToolInvoker';
import {
  handleAgentFinalResponse as _handleAgentFinalResponse,
} from './useChatMessages';
import { useAIConfig } from '../../contexts/AIConfigContext';

// ═══════════════════════════════════════════════════════════════════════════
// useChatRouter — Unified hook for Ask (help AI) + Revise (agent/revision)
// ═══════════════════════════════════════════════════════════════════════════
export default function useChatRouter({
  courseMap, activeTab,
  onRevision, onDeliverableRevision,
  isStopped, onResume,
  savedMessages, onMessagesChange,
  // Agent params
  deliverables, executeAction,
  delivUndoSnapshot,
  delivUndoFn,
  executeSyncPlan,
  notifyEdit,
  uid,
}) {
  const { apiKey, provider, modelId } = useAIConfig();
  const [messages, setMessages] = useState(savedMessages || []);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  function setStreaming(val) { isStreamingRef.current = val; setIsStreaming(val); }
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(null);

  // Sync messages to parent for persistence
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; });
  useEffect(() => {
    if (onMessagesChangeRef.current) onMessagesChangeRef.current(messages);
  // Intentionally excludes onMessagesChangeRef: the ref is updated in the preceding
  // effect so the callback is always current. Including it would cause an infinite loop
  // if the parent doesn't memoize onMessagesChange.
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save conversation to persistence layer
  const conversationIdRef = useRef(newConversationId());
  useEffect(() => {
    const visibleCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    if (visibleCount >= 2) {
      saveConversation(conversationIdRef.current, messages);
    }
  }, [messages]);

  // Keep fresh refs for values used in callbacks
  const executeActionRef = useRef(executeAction);
  useEffect(() => { executeActionRef.current = executeAction; });
  const delivRef = useRef(deliverables);
  useEffect(() => { delivRef.current = deliverables; });
  const snapshotRef = useRef(delivUndoSnapshot);
  useEffect(() => { snapshotRef.current = delivUndoSnapshot; });
  const undoFnRef = useRef(delivUndoFn);
  useEffect(() => { undoFnRef.current = delivUndoFn; });
  const executeSyncPlanRef = useRef(executeSyncPlan);
  useEffect(() => { executeSyncPlanRef.current = executeSyncPlan; });
  const notifyEditRef = useRef(notifyEdit);
  useEffect(() => { notifyEditRef.current = notifyEdit; });

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
      const successful = parsed.filter(f => f.text);
      if (successful.length > 0) setAttachedFiles(prev => [...prev, ...successful]);
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
  }, []);

  function removeAttached(idx) {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function send(text) {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || isStreamingRef.current) return;

    // Dismiss any pending or failed proposals
    setMessages(prev => prev.map(m =>
      m.role === 'proposal' && (m.status === 'pending' || m.status === 'failed')
        ? { ...m, status: 'dismissed' }
        : m
    ));

    // Resume stopped generation
    if (courseMap && isStopped && onResume && attachedFiles.length === 0) {
      setMessages(prev => [...prev, { role: 'user', text: trimmed }, { role: 'assistant', text: 'Resuming...' }]);
      onResume();
      return;
    }

    // Auto-route: agent (deliverables exist) → revision (course map only) → help (no course)
    const delivKeys = delivRef.current ? Object.keys(delivRef.current).filter(k => k !== 'courseMap') : [];
    const hasDeliverables = delivKeys.some(k => delivRef.current[k]?.status === 'done');
    const isGenerating = delivKeys.some(k => delivRef.current[k]?.status === 'generating');

    if (hasDeliverables && executeActionRef.current) {
      await sendAgentMessage(trimmed);
    } else if (isGenerating) {
      // Deliverables are being generated — use help mode but with context
      // Don't route to revision (which could conflict with generation)
      await sendHelpMessage(trimmed);
    } else if (courseMap) {
      await sendRevision(trimmed);
    } else {
      await sendHelpMessage(trimmed);
    }
  }

  // ── Ask mode: stream from help AI ─────────────────────────────────────────
  async function sendHelpMessage(text) {
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
      role: m.role,
      content: m.text || m.content || '',
    })), userMsg];

    setMessages(prev => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setStreaming(true);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const chatMessages = newMessages.slice(-20);
      const systemPrompt = getSystemPrompt(courseMap, activeTab);
      const { reader, parseChunk } = await streamChat(chatMessages, systemPrompt, controller.signal, apiKey, provider, modelId);

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
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', text: fullText };
                return updated;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => {
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
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the help chat, please configure your AI provider and API key first.'
            : isNoModel
            ? 'No AI model selected. Please select a model on the landing page first.'
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
      apiKey, provider, modelId,
      courseMap, activeTab,
      delivRef, executeActionRef, snapshotRef, undoFnRef, notifyEditRef,
      uid,
      maybeRunValidation,
      sendAgentMessage,
      handleAgentFinalResponse: (response) =>
        _handleAgentFinalResponse(response, buildSharedCtx()),
    };
  }

  // ── Agent mode: multi-step agentic loop (delegated to useToolInvoker) ────
  async function sendAgentMessage(text, { silent = false } = {}) {
    let fullMessage = text;
    if (!silent && attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map(f => `=== Attached File: ${f.name} ===\n${f.text}`)
        .join('\n\n');
      fullMessage = text
        ? `${text}\n\nThe user also attached these additional reference files:\n\n${fileContents}`
        : `Please incorporate the following additional reference files:\n\n${fileContents}`;
    }

    const displayText = text + (!silent && attachedFiles.length > 0
      ? ` [+${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}]`
      : '');

    if (!silent) setAttachedFiles([]);

    // Add user message + agentProgress card (silent mode: no user bubble)
    if (silent) {
      setMessages(prev => [...prev,
        { role: 'agentProgress', steps: [], status: 'running' },
      ]);
    } else {
      setMessages(prev => [...prev,
        { role: 'user', text: displayText },
        { role: 'agentProgress', steps: [], status: 'running' },
      ]);
    }
    setStreaming(true);

    await runAgentLoop(fullMessage, { silent }, buildSharedCtx());
  }

  // ── Proposal / diff review (delegated to useProposalHandler) ─────────────
  const {
    handleSelectProposal,
    handleAcceptDiff,
    handleRejectDiff,
  } = useProposalHandler({
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
    let fullMessage = text;
    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map(f => `=== Attached File: ${f.name} ===\n${f.text}`)
        .join('\n\n');
      fullMessage = text
        ? `${text}\n\nThe user also attached these additional reference files:\n\n${fileContents}`
        : `Please incorporate the following additional reference files:\n\n${fileContents}`;
    }

    const displayText = text + (attachedFiles.length > 0
      ? ` [+${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}]`
      : '');

    setAttachedFiles([]);
    // Use updater to avoid stale messages closure
    let chatHistorySnapshot;
    setMessages(prev => {
      const updated = [...prev, { role: 'user', text: displayText }];
      chatHistorySnapshot = updated
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10);
      return updated;
    });

    const isDeliverableTab = activeTab && activeTab !== 'courseMap';
    const delivHasData = isDeliverableTab && delivRef.current?.[activeTab]?.status === 'done';
    const handler = isDeliverableTab && delivHasData && onDeliverableRevision ? onDeliverableRevision : onRevision;

    try {
      const result = await handler(fullMessage, chatHistorySnapshot);
      const assistantReply = result?.chatReply || 'Updated! Review the changes in the workspace.';
      setMessages(prev => [...prev, { role: 'assistant', text: assistantReply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: `Failed: ${err.message}` }]);
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
    setMessages(prev => {
      const phase = data?.data?.phase;
      if (phase) {
        const alreadyExists = prev.some(m => m.role === 'progress' && m.data?.phase === phase);
        if (alreadyExists) return prev;
      }
      return [...prev, { role: 'progress', ...data }];
    });
  }

  // ── Sync suggestion methods (agent-mediated sync) ─────────────────────────
  const pushSyncSuggestion = useCallback((suggestion) => {
    setMessages(prev => {
      // Replace existing pending syncSuggestion (debounce coalescing)
      const existingIdx = prev.findIndex(m => m.role === 'syncSuggestion' && m.status === 'pending');
      const newMsg = { role: 'syncSuggestion', ...suggestion, status: 'pending' };
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = newMsg;
        return updated;
      }
      return [...prev, newMsg];
    });
  }, []);

  const handleApproveSyncSuggestion = useCallback(async (suggestionId) => {
    // Read plan from current messages before mutating state
    let plan, changedFieldsSummary;
    const currentMsgs = messagesRef.current;
    const matchMsg = currentMsgs.find(m => m.id === suggestionId);
    if (matchMsg) { plan = matchMsg.plan; changedFieldsSummary = matchMsg.changedFieldsSummary; }

    setMessages(prev =>
      prev.map(m => m.id === suggestionId ? { ...m, status: 'syncing' } : m)
    );

    if (!plan) return;

    try {
      const completed = await executeSyncPlanRef.current?.(plan, changedFieldsSummary || '');
      setMessages(prev => prev.map(m =>
        m.id === suggestionId ? { ...m, status: 'done', completedFeatureIds: completed || [] } : m
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === suggestionId ? { ...m, status: 'done', failedFeatureIds: (plan || []).map(p => p.featureId) } : m
      ));
    }
  }, []);

  const handleSkipSyncSuggestion = useCallback((suggestionId) => {
    setMessages(prev => prev.map(m =>
      m.id === suggestionId ? { ...m, status: 'skipped' } : m
    ));
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
      const gateMsg = currentMsgs.find(m => m.role === 'progress' && m.data?.phase === 'healthGate');
      if (gateMsg) {
        findings = gateMsg.data?.findings || [];
        setMessages(prev => {
          const gateIdx = prev.findIndex(m => m.role === 'progress' && m.data?.phase === 'healthGate');
          if (gateIdx < 0) return prev;
          const updated = [...prev];
          updated[gateIdx] = { ...updated[gateIdx], data: { ...updated[gateIdx].data, status: 'fixing' } };
          return updated;
        });
      }
    }

    if (findings.length === 0) return;

    const { autoFixable, needsDecision } = classifyFindings(findings);

    // Build the synthetic auto-fix prompt
    const parts = ['[AUTO-FIX MODE] The course health check found the following issues. Fix them now.\n'];

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

    parts.push('\nAfter fixing, run validate_course to verify improvements. Summarize what was fixed and what needs user decisions.');

    const prompt = parts.join('\n');
    sendAgentMessage(prompt, { silent: true });
  }

  /** Skip health gate and show normal completion card */
  function skipHealthGate(completionData) {
    setMessages(prev => {
      const updated = prev.map(m =>
        m.role === 'progress' && m.data?.phase === 'healthGate'
          ? { ...m, data: { ...m.data, status: 'skipped' } }
          : m
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

  return {
    messages,
    isStreaming, send, handleStop,
    attachedFiles, processFiles, removeAttached, isParsing,
    addProgressMessage,
    handleSelectProposal,
    handleAcceptDiff, handleRejectDiff,
    pushSyncSuggestion, handleApproveSyncSuggestion, handleSkipSyncSuggestion,
    triggerAutoFix, skipHealthGate,
  };
}
