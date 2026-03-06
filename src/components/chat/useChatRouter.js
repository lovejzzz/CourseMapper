import { useState, useRef, useEffect, useCallback } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { buildAgentSystemPrompt } from '../../lib/agentPrompts';
import { executeResearch } from '../../lib/academicSearch';
import { generateCourseHealthReport, classifyFindings } from '../../lib/pedagogicalValidator';
import { getChatOpener } from './constants';
import { AGENT_TOOLS, TOOL_LABELS, summarizeToolResult } from '../../lib/agentTools';
import { preValidateAction } from '../../lib/agentActions';
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
}) {
  const [messages, setMessages] = useState(savedMessages || []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const abortRef = useRef(null);

  // Sync messages to parent for persistence
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; });
  useEffect(() => {
    if (onMessagesChangeRef.current) onMessagesChangeRef.current(messages);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function maybeRunValidation() {
    if (!courseMap || !delivRef.current) return;
    const report = generateCourseHealthReport(courseMap, delivRef.current);
    if (report.errorCount > 0 || report.warningCount > 0) {
      setMessages(prev => [...prev, { role: 'validation', report }]);
    }
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
    if ((!trimmed && attachedFiles.length === 0) || isStreaming) return;

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
    setIsStreaming(true);

    try {
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
      setIsStreaming(false);
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
    setIsStreaming(true);

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

      // Build native tools for provider
      const nativeTools = buildNativeTools(provider, AGENT_TOOLS);

      // Loop messages (internal to this turn — separate from chat history)
      const loopMessages = [...chatHistory, { role: 'user', content: fullMessage }];

      const MAX_ITERATIONS = 10;
      let usedTools = false;

      // ── AGENTIC LOOP (native tool calling) ───────────────────────────────
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const { toolCalls, textContent, stopReason } = await fetchAgentResponseNative(
          loopMessages, systemPrompt, controller.signal, apiKey, provider, modelId, nativeTools,
        );

        // ── RESPOND TOOL (final answer) ──────────────────────────────────
        if (toolCalls) {
          const respondCall = toolCalls.find(tc => tc.name === 'respond');
          if (respondCall) {
            if (usedTools) {
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
          if (usedTools) {
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

          // Execute all tools in parallel
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
              };
              const result = await AGENT_TOOLS[tc.name].execute(tc.args || {}, ctx, controller.signal);
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

      // If loop exhausted MAX_ITERATIONS without breaking, notify the user
      if (!usedTools) {
        setMessages(prev => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex(m => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        updateProgress({ status: 'complete' });
      }
      // Only add a message if the loop truly exhausted (no break was hit)
      // We detect this by checking if the last iteration completed without breaking
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        // If the last message is already an assistant response or changeSummary, the loop did break
        if (lastMsg?.role === 'assistant' || lastMsg?.role === 'proposal' || lastMsg?.role === 'changeSummary') return prev;
        return [...prev, { role: 'assistant', text: "I've completed several steps but couldn't fully finish. Could you try a more specific request?" }];
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        updateProgress({ status: 'complete' });
        return;
      }
      const isNoKey = err.message === 'NO_API_KEY';
      const isNoModel = err.message === 'NO_MODEL_SELECTED';
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
    } finally {
      setIsStreaming(false);
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

    try {
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
      setIsStreaming(false);
    }
  }

  // ── Handle proposal selection ─────────────────────────────────────────────
  function handleSelectProposal(messageIndex, optionLabel) {
    const msg = messages[messageIndex];
    if (!msg || msg.role !== 'proposal') return;
    // Allow selection when pending OR when retrying after a failure
    if (msg.status !== 'pending' && msg.status !== 'failed') return;

    const option = msg.proposal?.options?.find(o => o.label === optionLabel);
    if (!option) return;

    const exec = executeActionRef.current;
    if (!exec) {
      setMessages(prev => [...prev, { role: 'error', text: 'Action executor not available.' }]);
      return;
    }

    // Pre-validate before executing
    const validation = preValidateAction(option.action, {
      deliverables: delivRef.current,
      courseMap,
    });
    if (!validation.valid) {
      // Auto-recover silently
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = { ...updated[messageIndex], status: 'dismissed' };
        return updated;
      });
      sendAgentMessage(
        `Option "${option.title}" is invalid: ${validation.reason}. `
        + `Please propose a new option targeting valid deliverables.`,
        { silent: true },
      );
      return;
    }

    const result = exec(option.action);

    if (result.success) {
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'selected',
          selectedLabel: optionLabel,
          failedLabel: null,
          failedMessage: null,
        };
        const actionType = option.action?.type === 'addItem' ? 'added'
          : option.action?.type === 'removeItem' ? 'removed' : 'edited';
        updated.push({
          role: 'changeSummary',
          summary: {
            changes: [{ type: actionType, featureId: option.action?.featureId, count: 1, label: option.title }],
            message: `Added "${option.title}" to your course.`,
          },
        });
        return updated;
      });
      maybeRunValidation();
    } else {
      // Auto-recover: dismiss the broken proposal and ask the agent to fix the issue
      const errorDetail = result.message || 'Unknown error';
      const featureId = option.action?.featureId || 'unknown';
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'dismissed',
        };
        return updated;
      });
      // Send to agent to find an alternative approach (silently — no user bubble)
      sendAgentMessage(
        `I tried to apply "${option.title}" but it failed: ${errorDetail}. `
        + `The deliverable "${featureId}" may not be available. `
        + `Please find another way to accomplish this — target a deliverable that IS generated (status "done"), or suggest an alternative approach.`,
        { silent: true },
      );
    }
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
    const updatedMessages = [...messages, { role: 'user', text: displayText }];
    setMessages(updatedMessages);

    const isDeliverableTab = activeTab && activeTab !== 'courseMap';
    const delivHasData = isDeliverableTab && delivRef.current?.[activeTab]?.status === 'done';
    const handler = isDeliverableTab && delivHasData && onDeliverableRevision ? onDeliverableRevision : onRevision;

    const chatHistory = updatedMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10);

    try {
      const result = await handler(fullMessage, chatHistory);
      const assistantReply = result?.chatReply || 'Updated! Review the changes in the workspace.';
      setMessages(prev => [...prev, { role: 'assistant', text: assistantReply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: `Failed: ${err.message}` }]);
    }
  }

  // ── Stop streaming ────────────────────────────────────────────────────────
  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
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
    let plan, changedFieldsSummary;
    setMessages(prev => {
      const msg = prev.find(m => m.id === suggestionId);
      if (msg) { plan = msg.plan; changedFieldsSummary = msg.changedFieldsSummary; }
      return prev.map(m => m.id === suggestionId ? { ...m, status: 'syncing' } : m);
    });

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
      setMessages(prev => {
        const gateIdx = prev.findIndex(m => m.role === 'progress' && m.data?.phase === 'healthGate');
        if (gateIdx < 0) return prev;
        findings = prev[gateIdx].data?.findings || [];
        const updated = [...prev];
        updated[gateIdx] = { ...updated[gateIdx], data: { ...updated[gateIdx].data, status: 'fixing' } };
        return updated;
      });
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
    pushSyncSuggestion, handleApproveSyncSuggestion, handleSkipSyncSuggestion,
    triggerAutoFix, skipHealthGate,
  };
}
