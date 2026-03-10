import { useState, useRef, useEffect, useCallback } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { buildAgentSystemPrompt } from '../../lib/agentPrompts';
import { executeResearch } from '../../lib/academicSearch';
import { generateCourseHealthReport, classifyFindings } from '../../lib/pedagogicalValidator';
import { getChatOpener } from './constants';
import { AGENT_TOOLS, TOOL_LABELS, summarizeToolResult } from '../../lib/agentTools';
import { preValidateAction } from '../../lib/agentActions';
import { getArrayKey } from '../../lib/syncDependencies';
import { saveConversation, newConversationId } from '../../lib/chatPersistence';
import { estimateTokens, getModelLimit, truncateToFit } from '../../lib/tokenEstimator';
import {
  buildNativeTools, buildAgentRequest, parseAgentResponse as parseProviderResponse,
  formatAssistantToolCalls, batchToolResults,
} from '../../lib/agentProviders';

// ── System prompt for Help / Tutor mode (extracted from FaqChatbot) ─────────
function getSystemPrompt(courseMap, activeTab) {
  let contextSection = '';
  if (courseMap) {
    const courseTitle = courseMap.courseName || 'Untitled Course';
    const lessons = courseMap.lessons || [];
    const lessonList = lessons.map((l, i) => `${i + 1}. ${l.title || 'Untitled Lesson'}`).join('\n');
    contextSection = `
## CURRENT USER CONTEXT (CRITICAL)
The user is actively working on a course inside Course Mapper. Act as a pedagogical co-pilot.

**Course Title:** ${courseTitle}
**Semester/Level:** ${courseMap.semester || 'Not specified'}
**Number of Lessons:** ${lessons.length}

**Course Outline:**
${lessonList}

${activeTab ? `**User's Current View:** They are looking at the \`${activeTab}\` deliverable.` : ''}

**YOUR DUAL ROLE:**
1. **Platform Support:** Answer questions about how to use Course Mapper.
2. **Pro-Level Pedagogical Tutor:** Proactively offer to help brainstorm activities, write objectives, analyze gaps — tailored to *their* ${courseTitle} curriculum.
`;
  } else {
    contextSection = `
## CURRENT USER CONTEXT
The user has not yet created a course. You are in general platform support mode.
Help them understand Course Mapper, how to attach an API key, and how to get started.
`;
  }

  return `You are the Course Mapper Help Assistant & Pedagogical Tutor — friendly, knowledgeable, embedded in the workspace.

${contextSection}

## What is Course Mapper?
A free, browser-based tool that transforms syllabi into complete teaching materials: Course Map, Lesson Plans, Slide Decks, Assignments, Rubrics, Discussions, Quiz Banks, Study Guides, and Syllabus. Everything runs client-side.

## Getting Started
- Upload course files (PDF, DOCX, XLSX, PPTX, etc.) or type a description.
- Choose an AI provider (OpenAI, Anthropic, or Google) and enter your API key.
- Select deliverables and click Generate.

## Key Features
- **Inline editing** — Click any text to edit directly.
- **Cascade sync** — Edit one deliverable and affected ones auto-update.
- **Export** — DOCX, PDF, XLSX, CSV, PPTX, Google Docs/Sheets/Slides, ZIP bundle.
- **Stop & Resume** — Pause and continue generation.
- **.coursemapper** — Save/load portable project files.

## AI API Keys
- **OpenAI:** https://platform.openai.com/api-keys
- **Anthropic:** https://console.anthropic.com/settings/keys
- **Google:** https://aistudio.google.com/apikey

## Rules
- Be concise, warm, and helpful. Use markdown formatting.
- If you don't know something, say so honestly.`;
}

// ── Streaming call to user's configured provider ────────────────────────────
async function streamChat(messages, systemPrompt, signal, apiKey, provider, modelId, maxTokens = 2048) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!modelId) throw new Error('NO_MODEL_SELECTED');

  const chatModel = modelId;

  if (provider === 'google') {
    const geminiMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chatModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
        generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
      }),
      signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }
    return {
      reader: response.body.getReader(),
      parseChunk: (parsed) => parsed.candidates?.[0]?.content?.parts?.[0]?.text || null,
    };
  }

  if (provider === 'anthropic') {
    const anthropicMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: chatModel,
        max_tokens: maxTokens,
        temperature: 0.4,
        stream: true,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
      signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }
    return {
      reader: response.body.getReader(),
      parseChunk: (parsed) => {
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) return parsed.delta.text;
        return null;
      },
    };
  }

  // OpenAI (default)
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chatModel,
      messages: openaiMessages,
      max_completion_tokens: maxTokens,
      temperature: 0.4,
      stream: true,
    }),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }
  return {
    reader: response.body.getReader(),
    parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
  };
}

// ── Native tool-calling LLM call for agentic loop ─────────────────────────
async function fetchAgentResponseNative(loopMessages, systemPrompt, signal, apiKey, provider, modelId, nativeTools) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!modelId) throw new Error('NO_MODEL_SELECTED');

  const { endpoint, headers, body } = buildAgentRequest(provider, {
    model: modelId,
    systemPrompt,
    messages: loopMessages,
    tools: nativeTools,
    maxTokens: 16384,
    temperature: 0.4,
    apiKey,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const json = await response.json();
  return parseProviderResponse(provider, json);
}

// ── Build chat history with agent memory ─────────────────────────────────────
// Converts proposals, actions, and errors into assistant messages so the AI
// knows what it previously proposed, what the user selected, and what succeeded.
function buildAgentChatHistory(messages) {
  const history = [];

  for (const m of messages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.text || m.content || '' });
    } else if (m.role === 'assistant') {
      const text = m.text || m.content || '';
      if (text) history.push({ role: 'assistant', content: text });
    } else if (m.role === 'proposal') {
      // Serialize proposal into an assistant message the AI can understand
      const options = m.proposal?.options || [];
      // Check if this is the last proposal in the messages array
      const isLastProposal = messages.findLastIndex(x => x.role === 'proposal') === messages.indexOf(m);

      if (isLastProposal && m.status === 'pending') {
        // Full serialization for the most recent pending proposal — enables refinement
        const optionDetails = options.map(o => {
          const itemJson = o.action?.item ? JSON.stringify(o.action.item) : '';
          return `${o.label}. "${o.title}" (${o.description || ''}) → ${o.action?.type} on ${o.action?.featureId || 'unknown'}${itemJson ? ` | item: ${itemJson}` : ''}`;
        }).join('\n');
        history.push({
          role: 'assistant',
          content: `[PROPOSAL (pending — user has not selected yet):\n${optionDetails}\n]`,
        });
      } else if (m.status === 'selected') {
        const chosen = options.find(o => o.label === m.selectedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User selected ${m.selectedLabel}: "${chosen?.title || '?'}". Applied successfully.]`,
        });
      } else if (m.status === 'failed') {
        const failedOpt = options.find(o => o.label === m.failedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User tried ${m.failedLabel}: "${failedOpt?.title || '?'}" but FAILED: ${m.failedMessage || 'unknown error'}. Other options still available.]`,
        });
      } else if (m.status === 'dismissed') {
        // Include detail for dismissed proposals so AI can refine
        const optionSummary = options.map(o =>
          `${o.label}. "${o.title}" (${o.description || ''})`
        ).join('; ');
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionSummary}. User dismissed and asked for changes.]`,
        });
      } else {
        const optionList = options.map(o =>
          `${o.label}. "${o.title}" → ${o.action?.type}`
        ).join('; ');
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. Awaiting user selection.]`,
        });
      }
    } else if (m.role === 'research') {
      // Include research context so the AI remembers what was searched
      const query = m.research?.query || 'unknown';
      const count = m.research?.results?.reduce((sum, g) => sum + (g.items?.length || 0), 0) || 0;
      history.push({
        role: 'assistant',
        content: `[I searched for "${query}" and found ${count} results from academic sources.]`,
      });
    } else if (m.role === 'validation') {
      const r = m.report;
      if (r) {
        history.push({
          role: 'assistant',
          content: `[Course health: ${r.errorCount} errors, ${r.warningCount} warnings. ${r.findings.slice(0, 3).map(f => f.message).join('; ')}]`,
        });
      }
    } else if (m.role === 'changeSummary') {
      const s = m.summary;
      const desc = (s?.changes || []).map(c =>
        `${c.type} ${c.count} in ${c.featureId}${c.label ? ` (${c.label})` : ''}`
      ).join(', ');
      history.push({ role: 'assistant', content: `[Applied changes: ${desc}]` });
    } else if (m.role === 'diagram') {
      history.push({ role: 'assistant', content: `[Generated diagram: ${m.diagram?.title || 'concept diagram'}]` });
    } else if (m.role === 'chart') {
      history.push({ role: 'assistant', content: `[Generated chart: ${m.chart?.title || 'data visualization'}]` });
    } else if (m.role === 'imageSearch') {
      history.push({ role: 'assistant', content: `[Image search: ${m.imageSearch?.query || 'images'}]` });
    } else if (m.role === 'syncSuggestion') {
      const featureNames = (m.plan || []).map(p => p.featureId).join(', ');
      const statusText = m.status === 'done' ? 'synced' : m.status === 'skipped' ? 'skipped' : 'pending';
      history.push({ role: 'assistant', content: `[Sync suggestion: ${featureNames} — ${statusText}]` });
    } else if (m.role === 'agentProgress') {
      // Serialize agentic turn as a summary
      const steps = m.steps || [];
      if (steps.length > 0) {
        const stepSummary = steps.map(s => `${s.tool}: ${s.summary || 'done'}`).join(', ');
        history.push({ role: 'assistant', content: `[Agent used ${steps.length} tool${steps.length !== 1 ? 's' : ''}: ${stepSummary}]` });
      }
    } else if (m.role === 'error') {
      history.push({ role: 'assistant', content: `[Error: ${m.text || 'unknown error'}]` });
    }
    // Skip 'progress' messages — not relevant for AI context
  }

  // Keep last 14 messages for context (enough for a few turns of proposals + confirmations)
  return history.slice(-14);
}

// ═══════════════════════════════════════════════════════════════════════════
// useChatRouter — Unified hook for Ask (help AI) + Revise (agent/revision)
// ═══════════════════════════════════════════════════════════════════════════
export default function useChatRouter({
  apiKey, provider, modelId,
  courseMap, activeTab,
  onRevision, onDeliverableRevision,
  isStopped, onResume,
  savedMessages, onMessagesChange,
  // Agent params
  deliverables, executeAction,
  delivUndoSnapshot,
  executeSyncPlan,
  uid,
}) {
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
  const executeSyncPlanRef = useRef(executeSyncPlan);
  useEffect(() => { executeSyncPlanRef.current = executeSyncPlan; });

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

  // ── Agent mode: multi-step agentic loop with native tool calling ─────────
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

    // Helper: update the progress card
    const updateProgress = (updater) => {
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findLastIndex(m => m.role === 'agentProgress');
        if (idx >= 0) updated[idx] = typeof updater === 'function' ? updater(updated[idx]) : { ...updated[idx], ...updater };
        return updated;
      });
    };

    // Helper: add a step to the progress card
    const addProgressStep = (step) => {
      updateProgress(card => ({
        ...card,
        steps: [...card.steps, step],
      }));
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

      // ── Context window awareness: trim if approaching limit ──
      const totalContext = systemPrompt + chatHistory.map(m => m.content).join('') + fullMessage;
      const estimatedTk = estimateTokens(totalContext);
      const modelLimit = getModelLimit(modelId);
      const usagePercent = Math.round((estimatedTk / modelLimit) * 100);

      // If over 80% of context window, trim chat history
      if (usagePercent > 80) {
        const excess = estimatedTk - Math.floor(modelLimit * 0.75);
        const charsToTrim = excess * 4;
        let trimmed = 0;
        while (chatHistory.length > 2 && trimmed < charsToTrim) {
          const removed = chatHistory.shift();
          trimmed += (removed.content || '').length;
        }
      }

      // Build native tools for provider
      const nativeTools = buildNativeTools(provider, AGENT_TOOLS);

      // Loop messages (internal to this turn — separate from chat history)
      const loopMessages = [...chatHistory, { role: 'user', content: fullMessage }];

      const MAX_ITERATIONS = 10;
      let usedTools = false;

      // ── Loop detection: track tool call signatures to prevent infinite loops ──
      const toolCallLog = []; // [{name, argsHash}]
      function detectLoop(toolCalls) {
        for (const tc of toolCalls) {
          const sig = tc.name + ':' + JSON.stringify(tc.args || {});
          toolCallLog.push(sig);
          const count = toolCallLog.filter(s => s === sig).length;
          if (count >= 3) return tc.name; // same tool+args called 3x
        }
        return null;
      }

      // ── AGENTIC LOOP (native tool calling) ───────────────────────────────
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const { toolCalls, textContent, stopReason } = await fetchAgentResponseNative(
          loopMessages, systemPrompt, controller.signal, apiKey, provider, modelId, nativeTools,
        );

        // ── RESPOND TOOL (final answer) ──────────────────────────────────
        if (toolCalls) {
          const respondCall = toolCalls.find(tc => tc.name === 'respond');
          if (respondCall) {
            // Silent mode: always remove progress card
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
              // No tools used — remove progress card entirely for clean UX
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
          // Silent mode: remove progress card, skip fallback message
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
          // Loop detection — stop if same tool+args repeated 3x
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

          // Add all steps to progress card at once — capture start index from latest state
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
              const ctx = {
                courseMap,
                deliverables: delivRef.current,
                executeAction: executeActionRef.current,
                snapshot: snapshotRef.current,
                uid,
              };

              // Execute with timeout + 1 retry for transient network errors
              async function execWithRetry(attempt = 0) {
                const toolPromise = AGENT_TOOLS[tc.name].execute(tc.args || {}, ctx, controller.signal);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`Tool ${tc.name} timed out after ${TOOL_TIMEOUT / 1000}s`)), TOOL_TIMEOUT)
                );
                try {
                  return await Promise.race([toolPromise, timeoutPromise]);
                } catch (err) {
                  // Retry once for transient errors (network, timeout)
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

              // If edit tool → also add a changeSummary to the chat
              if ((tc.name === 'edit_course_map' || tc.name === 'edit_deliverables') && result.applied > 0) {
                const changes = [];
                for (const detail of (result.details || [])) {
                  if (detail.success) {
                    const featureId = detail.featureId || 'courseMap';
                    const actionType = detail.action === 'addItem' ? 'added'
                      : detail.action === 'removeItem' ? 'removed' : 'edited';
                    const key = `${actionType}:${featureId}`;
                    const existing = changes.find(c => `${c.type}:${c.featureId}` === key);
                    if (existing) existing.count++;
                    else changes.push({ type: actionType, featureId, count: 1 });
                  }
                }
                if (changes.length > 0) {
                  setMessages(prev => [...prev, {
                    role: 'changeSummary',
                    summary: { changes, message: `${result.applied} change${result.applied !== 1 ? 's' : ''} applied.` },
                  }]);
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

          continue;
        }
      }

      // Silent mode: clean up progress card entirely — user should never see auto-fix steps
      if (silent) {
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else if (!usedTools) {
        // If loop exhausted MAX_ITERATIONS without any tool use, remove the empty progress card
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        updateProgress({ status: 'complete' });
      }
      // Only add a fallback message if non-silent and the loop truly exhausted (no break was hit)
      if (!silent) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          // If the last message is already an assistant response or changeSummary, the loop did break
          if (lastMsg?.role === 'assistant' || lastMsg?.role === 'proposal' || lastMsg?.role === 'changeSummary') return prev;
          return [...prev, { role: 'assistant', text: "I've completed several steps but couldn't fully finish. Could you try a more specific request?" }];
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Silent mode: remove progress card on abort too
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
      if (silent) {
        // Silent mode: just remove the progress card, don't show error to user
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          const errMsg = {
            role: 'assistant',
            text: isNoKey
              ? 'To use the agent, please configure your AI provider and API key first.'
              : isNoModel
              ? 'No AI model selected. Please select a model on the landing page first.'
              : "Sorry, I couldn't process that request. Please check your API key and try again.",
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

  // ── Handle final response from agentic loop (unwrapped from done envelope) ─
  function handleAgentFinalResponse(response) {
    if (!response) {
      setMessages(prev => [...prev, { role: 'assistant', text: "I couldn't generate a response." }]);
      return;
    }

    // Chat reply
    if (response.chatReply) {
      setMessages(prev => [...prev, { role: 'assistant', text: response.chatReply }]);
      return;
    }

    // Proposal — pre-validate options before showing
    if (response.proposal) {
      const options = response.proposal.options || [];
      const validOptions = options.filter(opt => {
        if (!opt.action) return true; // no action = info-only option
        const validation = preValidateAction(opt.action, {
          deliverables: delivRef.current,
          courseMap,
        });
        return validation.valid;
      });

      if (validOptions.length === 0 && options.length > 0) {
        // All options invalid — ask agent to retry silently
        sendAgentMessage(
          `All proposal options were invalid (targeting non-existent or out-of-range deliverables). `
          + `Please re-generate the proposal targeting deliverables that ARE generated (status "done") with valid lesson indices.`,
          { silent: true },
        );
        return;
      }

      setMessages(prev => [...prev, {
        role: 'proposal',
        proposal: { ...response.proposal, options: validOptions },
        status: 'pending',
      }]);
      return;
    }

    // Chart
    if (response.chart) {
      setMessages(prev => [...prev, {
        role: 'chart',
        chart: response.chart,
        status: 'complete',
      }]);
      return;
    }

    // Diagram
    if (response.diagram) {
      setMessages(prev => [...prev, {
        role: 'diagram',
        diagram: response.diagram,
        status: 'complete',
      }]);
      return;
    }

    // Image generation
    if (response.imageSearch) {
      setMessages(prev => [...prev, {
        role: 'imageSearch',
        imageSearch: response.imageSearch,
        status: 'complete',
        provider,
        apiKey,
      }]);
      return;
    }

    // Fallback: try to extract any text
    const text = response.chatReply || response.message || JSON.stringify(response);
    setMessages(prev => [...prev, { role: 'assistant', text }]);
  }

  // ── Handle legacy JSON-in-text response (used only by research synthesis) ──
  function handleLegacyResponse(fullText) {
    // Simple JSON extraction for research synthesis streaming path
    let parsed = null;
    try {
      let cleaned = (fullText || '').trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const start = cleaned.indexOf('{');
      if (start >= 0) {
        let depth = 0, end = -1, inStr = false, esc = false;
        for (let i = start; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (esc) { esc = false; continue; }
          if (ch === '\\' && inStr) { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end >= 0) parsed = JSON.parse(cleaned.slice(start, end + 1));
      }
    } catch { /* ignore parse errors */ }

    if (!parsed) {
      const fallbackText = (fullText && !fullText.trimStart().startsWith('{'))
        ? fullText
        : "I wasn't able to complete that request. Could you try asking about one specific aspect?";
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: fallbackText };
        return updated;
      });
      return;
    }

    // Route parsed response to appropriate handler
    if (parsed.chatReply) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply };
        return updated;
      });
    } else if (parsed.proposal) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'proposal', proposal: parsed.proposal, status: 'pending' };
        return updated;
      });
    } else if (parsed.diagram) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'diagram', diagram: parsed.diagram, status: 'complete' };
        return updated;
      });
    } else if (parsed.chart) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'chart', chart: parsed.chart, status: 'complete' };
        return updated;
      });
    } else if (parsed.imageSearch) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'imageSearch', imageSearch: parsed.imageSearch, status: 'complete', provider, apiKey };
        return updated;
      });
    } else {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply || parsed.message || fullText };
        return updated;
      });
    }
  }

  // ── Handle research request — search, then re-call LLM ──────────────────
  async function handleResearchRequest(researchReq) {
    const { query, sources, reason } = researchReq;

    // 1. Show research card in "searching" state
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: 'research',
        research: { query, reason, sources },
        status: 'searching',
      };
      return updated;
    });

    setStreaming(true);
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 2. Execute the research
      const { results, formatted } = await executeResearch(researchReq, controller.signal);

      // 3. Update the research card to "complete" state
      setMessages(prev => {
        const updated = [...prev];
        const researchIdx = updated.findLastIndex(m => m.role === 'research' && m.status === 'searching');
        if (researchIdx >= 0) {
          updated[researchIdx] = {
            ...updated[researchIdx],
            status: 'complete',
            research: { ...updated[researchIdx].research, results },
          };
        }
        // Add empty assistant placeholder for synthesis response
        updated.push({ role: 'assistant', text: '' });
        return updated;
      });

      // 4. Build chat history with research results injected
      const chatHistory = buildAgentChatHistory(
        messages.filter(m => m.role !== 'research')
      );
      chatHistory.push({
        role: 'user',
        content: `[SYSTEM: Research results for your query "${query}"]\n${formatted}\n\n[SYSTEM: Synthesize a response using these results. Use [N] citations. When proposing content (quizzes, assignments, discussions), embed research findings directly — e.g., use paper titles as recommended readings, cite findings in activity descriptions, or reference studies in discussion prompts. Respond with your normal JSON format — do NOT emit another research request.]`,
      });

      // 5. Stream the synthesis call
      const systemPrompt = buildAgentSystemPrompt(courseMap, activeTab, delivRef.current);
      const { reader, parseChunk } = await streamChat(
        chatHistory, systemPrompt, controller.signal, apiKey, provider, modelId,
        16384,
      );

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let chunkCount = 0;
      let detectedType = null;

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
              chunkCount++;

              // Live-stream chatReply content during synthesis
              if (chunkCount % 8 === 0) {
                if (!detectedType) {
                  const lower = fullText.toLowerCase();
                  if (lower.includes('"chatreply"')) detectedType = 'chatReply';
                  else if (lower.includes('"proposal"')) detectedType = 'proposal';
                  else if (lower.includes('"actions"')) detectedType = 'batchAction';
                  else if (lower.includes('"action"')) detectedType = 'action';
                  else if (lower.includes('"diagram"')) detectedType = 'diagram';
                  else if (lower.includes('"chart"')) detectedType = 'chart';
                  else if (lower.includes('"imagesearch"')) detectedType = 'imageSearch';
                }

                if (detectedType === 'chatReply') {
                  const match = fullText.match(/"chatReply"\s*:\s*"([\s\S]*?)(?:"|$)/);
                  if (match) {
                    const partial = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    setMessages(prev => {
                      const u = [...prev];
                      u[u.length - 1] = { role: 'assistant', text: partial };
                      return u;
                    });
                  }
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      // 6. Parse the synthesis response — guard against infinite loops
      let synthParsed = null;
      try { synthParsed = JSON.parse(fullText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')); } catch { /* ignore */ }
      if (synthParsed?.research) {
        // LLM tried to research again — force chatReply fallback
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            text: synthParsed.chatReply || synthParsed.message || 'I found some research results above but could not synthesize further. Please review the sources directly.',
          };
          return updated;
        });
        return;
      }

      // Normal handling of the synthesis response
      handleLegacyResponse(fullText);

    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.text) return prev.slice(0, -1);
          return prev;
        });
        return;
      }
      // Update research card to error state + add fallback message
      setMessages(prev => {
        const updated = [...prev];
        const researchIdx = updated.findLastIndex(m => m.role === 'research');
        if (researchIdx >= 0) {
          updated[researchIdx] = {
            ...updated[researchIdx],
            status: 'error',
            research: { ...updated[researchIdx].research, error: err.message },
          };
        }
        // Replace or add an assistant message with fallback
        const lastMsg = updated[updated.length - 1];
        if (lastMsg?.role === 'assistant' && !lastMsg.text) {
          updated[updated.length - 1] = {
            role: 'assistant',
            text: `I tried to search for "${researchReq.query}" but the search failed. Let me answer based on what I know.`,
          };
        } else {
          updated.push({
            role: 'assistant',
            text: `I tried to search for "${researchReq.query}" but the search failed. Let me answer based on what I know.`,
          });
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  // ── Generate diff preview for an action (before applying) ─────────────────
  function generateDiffPreview(action) {
    const preview = {};
    const type = action?.type;
    try {
      if (type === 'editCell') {
        // Read old value from courseMap
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        const section = lesson?.sections?.[action.sectionIndex];
        preview.oldValue = section?.[action.field] ?? '';
      } else if (type === 'editTitle') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        preview.oldValue = lesson?.title ?? '';
      } else if (type === 'removeItem') {
        // Read item that will be removed
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data) {
          const arrKey = Object.keys(entry.data).find(k => Array.isArray(entry.data[k]));
          if (arrKey) {
            const lessonItems = entry.data[arrKey]?.[action.lessonIndex];
            const items = Array.isArray(lessonItems) ? lessonItems : lessonItems?.items;
            preview.removedItem = items?.[action.itemIndex] ?? null;
          }
        }
      } else if (type === 'editItem') {
        // Read old value at the edit path
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data && action.path) {
          let val = entry.data;
          const parts = Array.isArray(action.path) ? [...action.path] : String(action.path).split('.');
          // Resolve root key: agent may send "slideDecks" but data uses "decks" etc.
          if (parts.length >= 1 && typeof parts[0] === 'string' && val[parts[0]] == null) {
            const actualKey = getArrayKey(action.featureId, val);
            if (actualKey) parts[0] = actualKey;
          }
          for (const p of parts) {
            if (val == null) break;
            val = val[p];
          }
          preview.oldValue = val ?? '';
        }
      } else if (type === 'deleteLesson') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        preview.lessonTitle = lesson?.title ?? `Lesson ${(action.lessonIndex ?? 0) + 1}`;
      }
    } catch { /* preview is best-effort */ }
    return preview;
  }

  // ── Handle proposal selection → show diff review first ──────────────────
  const proposalLockRef = useRef(false); // prevent concurrent selections

  function handleSelectProposal(messageIndex, optionLabel) {
    // Guard: prevent concurrent proposal selections
    if (proposalLockRef.current) return;

    const msg = messages[messageIndex];
    if (!msg || msg.role !== 'proposal') return;
    // Allow selection when pending, failed, or reviewing (user picks different option)
    if (msg.status !== 'pending' && msg.status !== 'failed' && msg.status !== 'reviewing') return;

    const option = msg.proposal?.options?.find(o => o.label === optionLabel);
    if (!option) return;

    const exec = executeActionRef.current;
    if (!exec) {
      setMessages(prev => [...prev, { role: 'error', text: 'Action executor not available.' }]);
      return;
    }

    proposalLockRef.current = true;

    // Pre-validate before executing
    const validation = preValidateAction(option.action, {
      deliverables: delivRef.current,
      courseMap,
    });
    if (!validation.valid) {
      // Mark as failed with specific error — not dismissed
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'failed',
          failedLabel: optionLabel,
          failedMessage: validation.reason,
        };
        return updated;
      });
      proposalLockRef.current = false;
      sendAgentMessage(
        `Option "${option.title}" is invalid: ${validation.reason}. `
        + `Please propose a new option that addresses this issue.`,
        { silent: true },
      );
      return;
    }

    // Generate a diff preview BEFORE applying
    const preview = generateDiffPreview(option.action);

    // Mark proposal as "reviewing" and push a diffReview message
    setMessages(prev => {
      const updated = [...prev];
      // Remove any existing pending diffReview for this proposal (user changed mind)
      const existingDiffIdx = updated.findIndex(
        m => m.role === 'diffReview' && m._proposalIndex === messageIndex && m.status === 'pending'
      );
      if (existingDiffIdx >= 0) updated.splice(existingDiffIdx, 1);

      updated[messageIndex] = {
        ...updated[messageIndex],
        status: 'reviewing',
        selectedLabel: optionLabel,
      };
      updated.push({
        role: 'diffReview',
        diff: {
          action: option.action,
          preview,
          optionTitle: option.title,
        },
        status: 'pending',
        _proposalIndex: messageIndex,
        _optionLabel: optionLabel,
      });
      return updated;
    });

    proposalLockRef.current = false;
  }

  // ── Accept diff → apply the change ────────────────────────────────────────
  function handleAcceptDiff(diffMessageIndex) {
    const msg = messages[diffMessageIndex];
    if (!msg || msg.role !== 'diffReview' || msg.status !== 'pending') return;

    const exec = executeActionRef.current;
    if (!exec) return;

    const { action, optionTitle } = msg.diff;
    const proposalIndex = msg._proposalIndex;
    const optionLabel = msg._optionLabel;

    const result = exec(action);

    if (result.success) {
      setMessages(prev => {
        const updated = [...prev];
        // Mark diff as accepted
        updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'accepted' };
        // Mark parent proposal as selected
        if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
          updated[proposalIndex] = {
            ...updated[proposalIndex],
            status: 'selected',
            selectedLabel: optionLabel,
            failedLabel: null,
            failedMessage: null,
          };
        }
        // Add change summary
        const actionType = (action?.type === 'addItem' || action?.type === 'addLesson') ? 'added'
          : (action?.type === 'removeItem' || action?.type === 'deleteLesson') ? 'removed' : 'edited';
        const target = action?.featureId || 'courseMap';
        updated.push({
          role: 'changeSummary',
          summary: {
            changes: [{ type: actionType, featureId: target, count: 1, label: optionTitle }],
            message: `Applied "${optionTitle}" to your course.`,
          },
        });
        return updated;
      });
      maybeRunValidation();
    } else {
      const errorDetail = result.message || 'Unknown error';
      const isCourseMapAction = ['editCell', 'editTitle', 'addLesson', 'deleteLesson'].includes(action?.type);
      setMessages(prev => {
        const updated = [...prev];
        updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'rejected' };
        // Mark proposal as failed (not dismissed) — other options remain clickable
        if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
          updated[proposalIndex] = {
            ...updated[proposalIndex],
            status: 'failed',
            failedLabel: optionLabel,
            failedMessage: errorDetail,
          };
        }
        return updated;
      });
      sendAgentMessage(
        `I tried to apply "${optionTitle}" but it failed: ${errorDetail}. `
        + (isCourseMapAction
          ? `The course map edit could not be applied. Please try a different approach.`
          : `The deliverable "${action?.featureId || 'unknown'}" may not be available. Please target a deliverable that IS generated (status "done"), or suggest an alternative approach.`),
        { silent: true },
      );
    }
  }

  // ── Reject diff → dismiss and optionally ask agent for alternative ────────
  function handleRejectDiff(diffMessageIndex) {
    const msg = messages[diffMessageIndex];
    if (!msg || msg.role !== 'diffReview' || msg.status !== 'pending') return;

    const proposalIndex = msg._proposalIndex;
    const optionTitle = msg.diff?.optionTitle || 'this change';

    setMessages(prev => {
      const updated = [...prev];
      updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'rejected' };
      // Restore parent proposal to pending so user can pick another option
      if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
        updated[proposalIndex] = {
          ...updated[proposalIndex],
          status: 'pending',
          selectedLabel: null,
        };
      }
      return updated;
    });
  }

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
