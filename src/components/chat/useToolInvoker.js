/**
 * useToolInvoker.js — Agent tool execution: agentic loop, parallel tool calling,
 * retry logic, loop detection, and progress card management.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 */

import { buildAgentSystemPrompt } from '../../lib/agentPrompts';
import { generateCourseHealthReport } from '../../lib/pedagogicalValidator';
import { AGENT_TOOLS, TOOL_LABELS, summarizeToolResult, classifyRequestComplexity } from '../../lib/agentTools';
import { preValidateAction } from '../../lib/agentActions';
import { estimateTokens, getModelLimit } from '../../lib/tokenEstimator';
import {
  buildNativeTools,
  formatAssistantToolCalls, batchToolResults,
} from '../../lib/agentProviders';
import {
  fetchAgentResponseNative, buildAgentChatHistory,
} from './useStreamProcessor';
import { getMemories, MEMORY_CATEGORIES } from '../../lib/agentMemory';

/**
 * Execute the multi-step agentic loop with native tool calling.
 *
 * This is a plain async function (not a hook) called from useChatRouter.
 * All React state is passed in via the `ctx` parameter so this module
 * stays free of React imports.
 *
 * @param {string} fullMessage  - The user (or synthetic) message to send
 * @param {Object} opts
 * @param {boolean}  opts.silent - If true, suppress user-facing messages
 * @param {Object}  ctx         - Shared context from useChatRouter
 */
export async function runAgentLoop(fullMessage, { silent = false }, ctx) {
  const {
    messages,
    setMessages,
    setStreaming,
    abortRef,
    apiKey, provider, modelId,
    courseMap, activeTab,
    delivRef, executeActionRef, snapshotRef, undoFnRef, notifyEditRef,
    uid,
    maybeRunValidation,
    handleAgentFinalResponse,
  } = ctx;

  // Helper: update the progress card
  const updateProgress = (updater) => {
    setMessages(prev => {
      const updated = [...prev];
      const idx = updated.findLastIndex(m => m.role === 'agentProgress');
      if (idx >= 0) updated[idx] = typeof updater === 'function' ? updater(updated[idx]) : { ...updated[idx], ...updater };
      return updated;
    });
  };

  // Helper: update a specific step by index
  const updateStepAt = (stepIndex, updates) => {
    updateProgress(card => {
      const steps = [...card.steps];
      if (stepIndex >= 0 && stepIndex < steps.length) {
        steps[stepIndex] = { ...steps[stepIndex], ...updates };
      }
      return { ...card, steps };
    });
  };

  try {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Load user preferences
    let userPrefs = null;
    try { userPrefs = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || 'null'); } catch { /* ignore */ }

    // Build context
    const chatHistory = buildAgentChatHistory(messages);
    const healthReport = (courseMap && delivRef.current)
      ? generateCourseHealthReport(courseMap, delivRef.current)
      : null;
    const healthSummary = (healthReport && (healthReport.errorCount > 0 || healthReport.warningCount > 0))
      ? healthReport.summary
      : null;
    const systemPrompt = buildAgentSystemPrompt(courseMap, activeTab, delivRef.current, healthSummary, userPrefs);

    // ── Context window awareness: smart trim if approaching limit ──
    const systemPromptTk = estimateTokens(systemPrompt);
    const OUTPUT_RESERVE_TK = 4096;
    const chatContent = chatHistory.map(m => m.content).join('') + fullMessage;
    const chatTk = estimateTokens(chatContent);
    const modelLimit = getModelLimit(modelId);
    const availableForChat = modelLimit - systemPromptTk - OUTPUT_RESERVE_TK;

    if (chatTk > availableForChat * 0.8) {
      const excess = chatTk - Math.floor(availableForChat * 0.75);
      const charsToTrim = excess * 4;
      // Score messages: user messages and recent messages are more valuable
      const scored = chatHistory.map((m, i) => ({
        ...m,
        _idx: i,
        _keep: (m.role === 'user' ? 3 : 1) + (i >= chatHistory.length - 4 ? 5 : 0),
      }));
      scored.sort((a, b) => a._keep - b._keep);
      let trimmed = 0;
      const toRemove = new Set();
      while (trimmed < charsToTrim && scored.length > 2) {
        const removed = scored.shift();
        trimmed += (removed.content || '').length;
        toRemove.add(removed._idx);
      }
      // Remove from chatHistory in reverse order to preserve indices
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (toRemove.has(i)) chatHistory.splice(i, 1);
      }
    }

    // ── Complexity-aware planning hint ──
    const complexity = classifyRequestComplexity(fullMessage, delivRef.current);
    let effectiveMessage = fullMessage;
    if (complexity === 'complex') {
      effectiveMessage = fullMessage + '\n\n[SYSTEM HINT: This is a complex request. Plan your approach: identify which deliverables and lessons to read/edit, then execute efficiently. Use parallel tool calls where possible.]';
    }

    // Build native tools for provider
    const nativeTools = buildNativeTools(provider, AGENT_TOOLS);

    // Loop messages (internal to this turn — separate from chat history)
    const loopMessages = [...chatHistory, { role: 'user', content: effectiveMessage }];

    // ── Auto-recall: on first conversation turn, surface memories as context ──
    const isFirstTurn = chatHistory.filter(m => m.role === 'user').length === 0;
    if (isFirstTurn) {
      try {
        const memories = getMemories();
        if (memories.length > 0) {
          const topMemories = memories.slice(0, 5).map(m =>
            `[${MEMORY_CATEGORIES[m.category] || m.category}] ${m.content}`
          ).join('\n');
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM — recalled from past sessions, use to inform your responses:\n${topMemories}\n]`,
          });
        }
      } catch { /* non-critical — skip if memory read fails */ }
    }

    const MAX_ITERATIONS = 10;
    let usedTools = false;

    // ── Adaptive temperature: deterministic for simple edits, creative for complex tasks ──
    const agentTemperature = complexity === 'simple' ? 0.2
      : complexity === 'complex' ? 0.5
      : 0.4;

    // ── Loop detection: track tool call signatures to prevent infinite loops ──
    const toolCallLog = [];
    function detectLoop(toolCalls) {
      for (const tc of toolCalls) {
        const sig = tc.name + ':' + JSON.stringify(tc.args || {});
        toolCallLog.push(sig);
        const count = toolCallLog.filter(s => s === sig).length;
        if (count >= 3) return tc.name;
      }
      return null;
    }

    // ── Thinking text callback for streaming progress ──
    const onThinkingText = (text) => {
      updateProgress(card => ({ ...card, thinkingText: text }));
    };

    // ── AGENTIC LOOP (native tool calling) ───────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const { toolCalls, textContent, stopReason } = await fetchAgentResponseNative(
        loopMessages, systemPrompt, controller.signal, apiKey, provider, modelId, nativeTools,
        { temperature: agentTemperature, onThinkingText },
      );

      // ── RESPOND TOOL (final answer) ──────────────────────────────────
      if (toolCalls) {
        const respondCall = toolCalls.find(tc => tc.name === 'respond');
        if (respondCall) {
          if (silent) {
            setMessages(prev => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          } else if (usedTools) {
            updateProgress({ status: 'complete' });
          } else {
            setMessages(prev => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          }
          handleAgentFinalResponse(respondCall.args);
          break;
        }
      }

      // ── NO TOOL CALLS: text-only fallback ───────────────────────────
      if (!toolCalls) {
        const fallbackText = textContent || "I wasn't able to complete that request. Could you try asking about one specific aspect?";
        if (silent) {
          setMessages(prev => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
            if (progressIdx >= 0) updated.splice(progressIdx, 1);
            return updated;
          });
        } else if (usedTools) {
          updateProgress({ status: 'complete' });
          setMessages(prev => [...prev, { role: 'assistant', text: fallbackText }]);
        } else {
          setMessages(prev => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
            if (progressIdx >= 0) updated[progressIdx] = { role: 'assistant', text: fallbackText };
            return updated;
          });
        }
        break;
      }

      // ── TOOL CALLS (parallel execution) ─────────────────────────────
      const nonRespondCalls = toolCalls.filter(tc => tc.name !== 'respond');
      if (nonRespondCalls.length > 0) {
        const loopedTool = detectLoop(nonRespondCalls);
        if (loopedTool) {
          updateProgress({ status: 'error' });
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `I noticed I was repeating the same operation (${loopedTool}) without making progress. Could you rephrase your request or be more specific?`,
          }]);
          break;
        }

        usedTools = true;

        let stepStartIndex = 0;
        const newSteps = nonRespondCalls.map(tc => ({
          tool: tc.name,
          label: TOOL_LABELS[tc.name] || tc.name,
          thought: '',
          status: 'running',
          summary: '',
        }));

        updateProgress(card => {
          stepStartIndex = card.steps.length;
          return { ...card, steps: [...card.steps, ...newSteps] };
        });

        // Execute all tools in parallel (with 30s per-tool timeout)
        const TOOL_TIMEOUT = 30000;
        const toolResults = await Promise.all(nonRespondCalls.map(async (tc, i) => {
          const stepIdx = stepStartIndex + i;
          if (!AGENT_TOOLS[tc.name]) {
            updateStepAt(stepIdx, { status: 'error', summary: `Unknown tool: ${tc.name}` });
            return { toolCallId: tc.id, toolName: tc.name, result: { error: `Unknown tool: ${tc.name}. Available: ${Object.keys(AGENT_TOOLS).join(', ')}` } };
          }

          try {
            const toolCtx = {
              courseMap,
              deliverables: delivRef.current,
              executeAction: executeActionRef.current,
              snapshot: snapshotRef.current,
              undoFn: undoFnRef?.current || null,
              uid,
            };

            async function execWithRetry(attempt = 0) {
              const toolPromise = AGENT_TOOLS[tc.name].execute(tc.args || {}, toolCtx, controller.signal);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Tool ${tc.name} timed out after ${TOOL_TIMEOUT / 1000}s`)), TOOL_TIMEOUT)
              );
              try {
                return await Promise.race([toolPromise, timeoutPromise]);
              } catch (err) {
                const isTransient = err.message?.includes('timed out') ||
                  err.message?.includes('fetch') ||
                  err.message?.includes('network') ||
                  err.message?.includes('Failed to fetch');
                if (isTransient && attempt < 1) {
                  updateStepAt(stepIdx, { summary: 'Retrying...' });
                  return execWithRetry(attempt + 1);
                }
                throw err;
              }
            }

            const result = await execWithRetry();
            const summary = summarizeToolResult(tc.name, result);
            updateStepAt(stepIdx, { status: 'done', summary });

            // If edit tool -> add changeSummary + trigger sync cascade
            if ((tc.name === 'edit_course_map' || tc.name === 'edit_deliverables') && result.applied > 0) {
              const changes = [];
              const editedFeatures = new Set();
              for (const detail of (result.details || [])) {
                if (detail.success) {
                  const featureId = detail.featureId || 'courseMap';
                  const actionType = detail.action === 'addItem' ? 'added'
                    : detail.action === 'removeItem' ? 'removed' : 'edited';
                  const key = `${actionType}:${featureId}`;
                  const existing = changes.find(c => `${c.type}:${c.featureId}` === key);
                  if (existing) existing.count++;
                  else changes.push({ type: actionType, featureId, count: 1 });
                  if (featureId !== 'courseMap') {
                    editedFeatures.add(`${featureId}:${detail.lessonIndex ?? 0}`);
                  }
                }
              }
              if (changes.length > 0) {
                setMessages(prev => [...prev, {
                  role: 'changeSummary',
                  summary: { changes, message: `${result.applied} change${result.applied !== 1 ? 's' : ''} applied.` },
                }]);
              }

              if (notifyEditRef.current && editedFeatures.size > 0) {
                for (const entry of editedFeatures) {
                  const [fid, lidx] = entry.split(':');
                  const lessonIndex = lidx !== 'undefined' ? parseInt(lidx, 10) : null;
                  notifyEditRef.current(lessonIndex, '_deliverableEdit', fid);
                }
              }

              maybeRunValidation();
            }

            return { toolCallId: tc.id, toolName: tc.name, result };
          } catch (toolErr) {
            if (toolErr.name === 'AbortError') throw toolErr;
            updateStepAt(stepIdx, { status: 'error', summary: toolErr.message });
            return { toolCallId: tc.id, toolName: tc.name, result: { error: toolErr.message } };
          }
        }));

        // Add assistant tool-call turn + all tool results to loop messages
        loopMessages.push(formatAssistantToolCalls(provider, nonRespondCalls));
        const resultMessages = batchToolResults(provider, toolResults);
        loopMessages.push(...resultMessages);

        // ── Self-correction: inject recovery hints for failed tool calls ──
        const failedResults = toolResults.filter(r => r.result?.error);
        if (failedResults.length > 0) {
          const hints = failedResults.map(r =>
            `Tool "${r.toolName}" failed: ${r.result.error}. Try a different approach or correct the arguments.`
          ).join(' ');
          loopMessages.push({ role: 'user', content: `[SYSTEM] ${hints}` });
        }

        // ── Post-edit validation: check for new issues after edits ──
        const editResults = toolResults.filter(r =>
          (r.toolName === 'edit_course_map' || r.toolName === 'edit_deliverables') &&
          r.result?.applied > 0
        );
        if (editResults.length > 0 && iteration < MAX_ITERATIONS - 2) {
          try {
            const postReport = generateCourseHealthReport(courseMap, delivRef.current);
            if (postReport && postReport.errorCount > 0) {
              const newErrors = postReport.findings
                .filter(f => f.severity === 'error')
                .slice(0, 3)
                .map(f => f.message)
                .join('; ');
              loopMessages.push({
                role: 'user',
                content: `[SYSTEM] Post-edit validation found ${postReport.errorCount} error(s): ${newErrors}. Consider fixing these in your next tool call if possible, or mention them in your response.`,
              });
            }
          } catch { /* validation is non-critical — don't block the loop */ }
        }

        continue;
      }
    }

    // Post-loop cleanup
    if (silent) {
      setMessages(prev => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else if (!usedTools) {
      setMessages(prev => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      updateProgress({ status: 'complete' });
    }
    if (!silent) {
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === 'assistant' || lastMsg?.role === 'proposal' || lastMsg?.role === 'changeSummary') return prev;
        return [...prev, { role: 'assistant', text: "I've completed several steps but couldn't fully finish. Could you try a more specific request?" }];
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (silent) {
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        updateProgress({ status: 'complete' });
      }
      return;
    }
    const isNoKey = err.message === 'NO_API_KEY';
    const isNoModel = err.message === 'NO_MODEL_SELECTED';
    console.error('[CM Agent] Error:', err.message, err);
    if (silent) {
      setMessages(prev => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      const detail = !isNoKey && !isNoModel && err.message ? ` (${err.message})` : '';
      setMessages(prev => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
        const errMsg = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the agent, please configure your AI provider and API key first.'
            : isNoModel
            ? 'No AI model selected. Please select a model on the landing page first.'
            : `Sorry, I couldn't process that request.${detail}`,
        };
        if (progressIdx >= 0) updated[progressIdx] = errMsg;
        else updated.push(errMsg);
        return updated;
      });
    }
  } finally {
    setStreaming(false);
  }
}
