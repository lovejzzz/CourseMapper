/**
 * useStreamProcessor.js — Streaming response parsing & provider API calls.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 * Contains:
 *  - getSystemPrompt()          — builds the Help/Tutor system prompt
 *  - streamChat()               — SSE streaming call to user's AI provider
 *  - fetchAgentResponseNative() — non-streaming native tool-calling call
 *  - buildAgentChatHistory()    — converts rich message list to plain chat history
 */

import {
  buildAgentRequest,
  parseAgentResponse as parseProviderResponse,
  supportsCustomTemperature,
} from '../../lib/agentProviders';
import { formatPackageSummaryForHistory } from '../../lib/packageFinalizerSummary';
import { getGoogleModelBaseUrl } from '../../lib/googleProvider';
import {
  buildOpenAIResponsesBody,
  parseOpenAIResponsesStreamChunk,
  prefersOpenAIResponsesApi,
} from '../../lib/openaiProvider';
import { isLandingAgentContextText } from '../../lib/landingAgentContext';
import {
  AGENT_SOURCE_CONTEXT_ROLE,
  formatAgentSourceContextForHistory,
  isAgentSourceContextText,
} from '../../lib/agentSourceContext';
import { resolveLabel } from './constants';
// webllm is dynamically imported when needed; its runtime is loaded externally for Local AI users only.

// ── System prompt for Help / Tutor mode (extracted from FaqChatbot) ─────────
export function getSystemPrompt(courseMap, activeTab) {
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
- Choose an AI provider (OpenAI, Anthropic, Google, or DeepSeek) and enter your API key.
- Select deliverables and click Generate.

## Key Features
- **Inline editing** — Click any text to edit directly.
- **Cascade sync** — Edit one deliverable and affected ones auto-update.
- **Export** — DOCX, PDF, XLSX, CSV, PPTX, Google Docs/Sheets/Slides, ZIP bundle.
- **Stop & Resume** — Pause and continue generation.
- **.coursemapper** — Save/load portable project files.

## AI Providers
- **Free (Local AI):** Runs Qwen 3 directly in the browser via WebGPU — no API key needed, no cost
- **OpenAI:** https://platform.openai.com/api-keys
- **Anthropic:** https://console.anthropic.com/settings/keys
- **Google:** https://aistudio.google.com/apikey
- **DeepSeek:** https://platform.deepseek.com/api_keys

## Rules
- Be concise, warm, and helpful. Use markdown formatting.
- If you don't know something, say so honestly.`;
}

// ── Streaming call to user's configured provider ────────────────────────────
export async function streamChat(messages, systemPrompt, signal, apiKey, provider, modelId, maxTokens = 2048) {
  if (provider !== 'webllm' && !apiKey) throw new Error('NO_API_KEY');
  if (!modelId) throw new Error('NO_MODEL_SELECTED');

  const chatModel = modelId;

  // WebLLM: local browser inference — emit SSE-formatted chunks via ReadableStream
  if (provider === 'webllm') {
    const { getEngine } = await import('../../lib/webllm');
    const engine = await getEngine(chatModel);
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const asyncIter = await engine.chat.completions.create({
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: maxTokens,
      stream: true,
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await asyncIter.next();
          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return {
      reader: stream.getReader(),
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
    };
  }

  if (provider === 'google') {
    const geminiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `${getGoogleModelBaseUrl(apiKey, chatModel)}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
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
    const anthropicMessages = messages.map((m) => ({ role: m.role, content: m.content }));
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

  // OpenAI / DeepSeek / OpenRouter (OpenAI-compatible)
  const useResponses = provider === 'openai' && prefersOpenAIResponsesApi(chatModel);
  const baseUrl = useResponses
    ? 'https://api.openai.com/v1/responses'
    : provider === 'deepseek'
      ? 'https://api.deepseek.com/v1/chat/completions'
      : provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const openaiHeaders = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(provider === 'openrouter' ? { 'HTTP-Referer': window.location.origin } : {}),
  };
  const tempSetting = supportsCustomTemperature(chatModel) ? { temperature: 0.4 } : {};
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: openaiHeaders,
    body: JSON.stringify(
      useResponses
        ? buildOpenAIResponsesBody({
            model: chatModel,
            systemPrompt,
            userPrompt: messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
            maxOutputTokens: maxTokens,
            temperature: tempSetting.temperature,
            stream: true,
          })
        : {
            model: chatModel,
            messages: openaiMessages,
            ...(provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
            ...tempSetting,
            stream: true,
            ...(provider === 'openrouter' ? { provider: { data_collection: 'allow' } } : {}),
          },
    ),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }
  return {
    reader: response.body.getReader(),
    parseChunk: useResponses
      ? parseOpenAIResponsesStreamChunk
      : (parsed) => parsed.choices?.[0]?.delta?.content || null,
  };
}

// ── Native tool-calling LLM call for agentic loop ─────────────────────────
export async function fetchAgentResponseNative(
  loopMessages,
  systemPrompt,
  signal,
  apiKey,
  provider,
  modelId,
  nativeTools,
  { temperature: tempOverride, onThinkingText } = {},
) {
  if (provider !== 'webllm' && !apiKey) throw new Error('NO_API_KEY');
  if (!modelId) throw new Error('NO_MODEL_SELECTED');

  // WebLLM: local inference without tool calling — return text-only response
  if (provider === 'webllm') {
    const { completeLocal } = await import('../../lib/webllm');
    const response = await completeLocal(
      modelId,
      [{ role: 'system', content: systemPrompt }, ...loopMessages.map((m) => ({ role: m.role, content: m.content }))],
      { temperature: tempOverride ?? 0.4, max_tokens: 4096 },
    );
    const text = response.choices?.[0]?.message?.content || '';
    return { toolCalls: null, textContent: text, stopReason: 'stop' };
  }

  // Streaming for OpenAI/DeepSeek — shows partial text while LLM is thinking
  const useStreaming =
    onThinkingText && (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter');

  let temperature = supportsCustomTemperature(modelId) ? (tempOverride ?? 0.4) : undefined;

  for (let tempRetry = 0; tempRetry < 2; tempRetry++) {
    const { endpoint, headers, body } = buildAgentRequest(provider, {
      model: modelId,
      systemPrompt,
      messages: loopMessages,
      tools: nativeTools,
      maxTokens: 16384,
      temperature,
      apiKey,
    });

    if (useStreaming) body.stream = true;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API error: ${response.status}`;
      // If model doesn't support custom temperature, retry with the provider default.
      if (tempRetry === 0 && /temperature/i.test(msg)) {
        console.log('[CM] Model does not support custom temperature, retrying without temperature');
        temperature = undefined;
        continue;
      }
      throw new Error(msg);
    }

    // ── Streaming path: parse SSE chunks for OpenAI/DeepSeek ──
    if (useStreaming) {
      try {
        return await parseStreamingToolResponse(response, onThinkingText);
      } catch (streamErr) {
        // If streaming parse fails, fall back to non-streaming on next iteration
        console.warn('[CM] Streaming parse failed, will retry non-streaming:', streamErr.message);
        throw streamErr;
      }
    }

    const json = await response.json();
    return parseProviderResponse(provider, json);
  }
}

/**
 * Parse a streaming OpenAI/DeepSeek response that may contain tool calls.
 * Emits partial text content via onThinkingText callback for live progress.
 */
async function parseStreamingToolResponse(response, onThinkingText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textContent = '';
  let reasoningContent = '';
  // Accumulate tool calls: { index → { id, name, arguments } }
  const toolCallMap = {};
  let finishReason = null;

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
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;
        finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

        if (!delta) continue;

        // Accumulate DeepSeek thinking content for provider round-tripping.
        // Keep this internal; it is not surfaced in the UI.
        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
        }

        // Accumulate text content
        if (delta.content) {
          textContent += delta.content;
          onThinkingText(textContent);
        }

        // Accumulate tool calls (streamed incrementally by index)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallMap[idx]) {
              toolCallMap[idx] = { id: tc.id || '', name: '', arguments: '' };
            }
            if (tc.id) toolCallMap[idx].id = tc.id;
            if (tc.function?.name) toolCallMap[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCallMap[idx].arguments += tc.function.arguments;
          }
        }
      } catch {
        /* ignore malformed chunks */
      }
    }
  }

  // Build final result
  const toolCalls = Object.values(toolCallMap);
  const parsed =
    toolCalls.length > 0
      ? toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: safeJsonParse(tc.arguments),
        }))
      : null;

  return {
    toolCalls: parsed,
    textContent: textContent || null,
    stopReason: finishReason || 'stop',
    assistantMessage: parsed
      ? {
          role: 'assistant',
          content: textContent || null,
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments || '{}' },
          })),
        }
      : null,
  };
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function getWorkspacePlanHistoryActionKey(action, index = 0) {
  const intent = typeof action?.intent === 'string' ? action.intent : action?.intent?.type || 'continue_plan';
  const featureIds = [
    ...(Array.isArray(action?.intent?.featureIds) ? action.intent.featureIds : []),
    ...(Array.isArray(action?.featureIds) ? action.featureIds : []),
  ]
    .map((featureId) => String(featureId || '').trim())
    .filter(Boolean)
    .join(',');
  return [intent, action?.priority || `P${index}`, action?.title || '', action?.target || '', featureIds]
    .map((part) => String(part || '').trim())
    .join('|');
}

function formatWorkspacePlanForHistory(plan, messageActionStates = null) {
  if (!plan) return '[Workspace plan: unavailable]';
  const actions = Array.isArray(plan.actions) ? plan.actions.slice(0, 3) : [];
  const top = plan.highestImpactAction || actions[0] || null;
  const evidence = plan.evidence || {};
  const actionStates =
    messageActionStates && typeof messageActionStates === 'object'
      ? messageActionStates
      : plan.actionStates && typeof plan.actionStates === 'object'
        ? plan.actionStates
        : {};
  const intentOf = (action) => (typeof action?.intent === 'string' ? action.intent : action?.intent?.type || '');
  const safeModeLabel = (safeMode) =>
    ({
      'inspect-first': 'inspect first',
      'review-only': 'inspect first',
      'safe-edit': 'safe edit',
      'safe-auto-fix': 'safe edit',
      'needs-approval': 'needs approval',
      'requires-generation': 'requires generation',
    })[safeMode] ||
    safeMode ||
    '';
  const actionText = actions
    .map((action, index) => {
      const actionState = actionStates[getWorkspacePlanHistoryActionKey(action, index)];
      const modeLabel = safeModeLabel(action.safeMode);
      const parts = [
        `${index + 1}. ${action.title}${modeLabel ? ` (${modeLabel})` : ''}`,
        actionState?.status ? `status=${actionState.status}` : '',
        intentOf(action) ? `intent=${intentOf(action)}` : '',
        action.target ? `target=${action.target}` : '',
        action.reason ? `reason=${action.reason}` : '',
        action.toolHint ? `toolHint=${action.toolHint}` : '',
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join('; ');
  return [
    '[Workspace plan',
    top?.title ? ` top: ${top.title}` : '',
    ` evidence: ${evidence.generatedFeatureCount || 0} generated, ${evidence.staleFeatureCount || 0} stale, ${
      evidence.failedFeatureCount || 0
    } failed, ${evidence.packageBlockerCount || 0} package blockers, ${
      evidence.classroomBlockerCount || 0
    } classroom blockers`,
    actionText ? ` actions: ${actionText}` : '',
    ']',
  ].join('');
}

function formatReceiptActionStates(actionStates) {
  const entries = Object.entries(actionStates && typeof actionStates === 'object' ? actionStates : {})
    .map(([key, state]) => {
      const status = String(state?.status || '').trim();
      if (!status) return null;
      const actionLabel =
        String(key || '')
          .split('|')
          .find(Boolean) || 'action';
      return `${actionLabel}=status:${status}`;
    })
    .filter(Boolean)
    .slice(0, 4);
  return entries.join('; ');
}

function formatToolManifestForHistory(toolManifest) {
  if (!Array.isArray(toolManifest) || toolManifest.length === 0) return '';
  return toolManifest
    .slice(0, 5)
    .map((step) => {
      const parts = [
        step.label || step.tool || 'Agent tool',
        step.status ? `status=${step.status}` : '',
        step.summary ? `summary=${step.summary}` : '',
        Array.isArray(step.targets) && step.targets.length > 0 ? `target=${step.targets.join(', ')}` : '',
      ].filter(Boolean);
      return parts.join(' ');
    })
    .join('; ');
}

function formatAgentReceiptForHistory(receipt = {}, messageActionStates = null) {
  const changed = Array.isArray(receipt.changed) ? receipt.changed.filter(Boolean).slice(0, 3).join('; ') : '';
  const checked = Array.isArray(receipt.checked) ? receipt.checked.filter(Boolean).slice(0, 3).join('; ') : '';
  const issues = Array.isArray(receipt.issues) ? receipt.issues.filter(Boolean).slice(0, 3).join('; ') : '';
  const runStats = receipt.runStats && typeof receipt.runStats === 'object' ? receipt.runStats : null;
  const actionStates =
    messageActionStates && typeof messageActionStates === 'object'
      ? messageActionStates
      : receipt.actionStates && typeof receipt.actionStates === 'object'
        ? receipt.actionStates
        : {};
  const actionStateSummary = formatReceiptActionStates(actionStates);
  const toolSummary = formatToolManifestForHistory(receipt.toolManifest);
  const parts = [
    receipt.title || 'Agent receipt',
    receipt.status ? `status=${receipt.status}` : '',
    receipt.intent?.type ? `intent=${receipt.intent.type}` : '',
    receipt.mode ? `mode=${receipt.mode}` : '',
    receipt.target ? `target=${receipt.target}` : '',
    runStats
      ? `tools=${runStats.toolCount || 0}, actions=${runStats.actionCount || 0}, checks=${runStats.checkCount || 0}`
      : '',
    runStats?.providerCallCount ? `modelCalls=${runStats.providerCallCount}` : '',
    runStats?.stopReason ? `stop=${runStats.stopReason}` : '',
    changed ? `changed=${changed}` : '',
    checked ? `checked=${checked}` : '',
    issues ? `issues=${issues}` : '',
    toolSummary ? `toolManifest=${toolSummary}` : '',
    actionStateSummary ? `receiptActions=${actionStateSummary}` : '',
    receipt.next ? `next=${receipt.next}` : '',
  ].filter(Boolean);
  return `[${parts.join(' | ')}]`;
}

// ── Build chat history with agent memory ─────────────────────────────────────
// Converts proposals, actions, and errors into assistant messages so the AI
// knows what it previously proposed, what the user selected, and what succeeded.
export function buildAgentChatHistory(messages) {
  const history = [];

  for (const m of messages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.agentPromptOverride || m.text || m.content || '' });
    } else if (m.role === 'assistant') {
      const text = m.text || m.content || '';
      if (text) history.push({ role: 'assistant', content: text });
    } else if (m.role === 'proposal') {
      // Serialize proposal into an assistant message the AI can understand
      const options = m.proposal?.options || [];
      // Check if this is the last proposal in the messages array
      const isLastProposal = messages.findLastIndex((x) => x.role === 'proposal') === messages.indexOf(m);

      if (isLastProposal && m.status === 'pending') {
        // Full serialization for the most recent pending proposal — enables refinement
        const optionDetails = options
          .map((o) => {
            const itemJson = o.action?.item ? JSON.stringify(o.action.item) : '';
            return `${o.label}. "${o.title}" (${o.description || ''}) → ${o.action?.type} on ${o.action?.featureId || 'unknown'}${itemJson ? ` | item: ${itemJson}` : ''}`;
          })
          .join('\n');
        history.push({
          role: 'assistant',
          content: `[PROPOSAL (pending — user has not selected yet):\n${optionDetails}\n]`,
        });
      } else if (m.status === 'selected') {
        const chosen = options.find((o) => o.label === m.selectedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User selected ${m.selectedLabel}: "${chosen?.title || '?'}". Applied successfully.]`,
        });
      } else if (m.status === 'failed') {
        const failedOpt = options.find((o) => o.label === m.failedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User tried ${m.failedLabel}: "${failedOpt?.title || '?'}" but FAILED: ${m.failedMessage || 'unknown error'}. Other options still available.]`,
        });
      } else if (m.status === 'dismissed') {
        // Include detail for dismissed proposals so AI can refine
        const optionSummary = options.map((o) => `${o.label}. "${o.title}" (${o.description || ''})`).join('; ');
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionSummary}. User dismissed and asked for changes.]`,
        });
      } else {
        const optionList = options.map((o) => `${o.label}. "${o.title}" → ${o.action?.type}`).join('; ');
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
          content: `[Course health: ${r.errorCount} errors, ${r.warningCount} warnings. ${r.findings
            .slice(0, 3)
            .map((f) => f.message)
            .join('; ')}]`,
        });
      }
    } else if (m.role === 'changeSummary') {
      const s = m.summary;
      const desc = (s?.changes || [])
        .map((c) => `${c.type} ${c.count} in ${resolveLabel(c.featureId)}${c.label ? ` (${c.label})` : ''}`)
        .join(', ');
      history.push({ role: 'assistant', content: `[Applied changes: ${desc}]` });
    } else if (m.role === 'packageSummary') {
      history.push({ role: 'assistant', content: formatPackageSummaryForHistory(m.summary) });
    } else if (m.role === 'workspacePlan') {
      history.push({ role: 'assistant', content: formatWorkspacePlanForHistory(m.plan, m.actionStates) });
    } else if (m.role === 'agentReceipt') {
      history.push({ role: 'assistant', content: formatAgentReceiptForHistory(m.receipt, m.actionStates) });
    } else if (m.role === AGENT_SOURCE_CONTEXT_ROLE) {
      history.push({ role: 'user', content: formatAgentSourceContextForHistory(m) });
    } else if (m.role === 'diagram') {
      history.push({ role: 'assistant', content: `[Generated diagram: ${m.diagram?.title || 'concept diagram'}]` });
    } else if (m.role === 'chart') {
      history.push({ role: 'assistant', content: `[Generated chart: ${m.chart?.title || 'data visualization'}]` });
    } else if (m.role === 'imageSearch') {
      history.push({ role: 'assistant', content: `[Image search: ${m.imageSearch?.query || 'images'}]` });
    } else if (m.role === 'syncSuggestion') {
      const featureNames = (m.plan || []).map((p) => resolveLabel(p.featureId)).join(', ');
      const statusText = m.status === 'done' ? 'synced' : m.status === 'skipped' ? 'skipped' : 'pending';
      history.push({ role: 'assistant', content: `[Sync suggestion: ${featureNames} — ${statusText}]` });
    } else if (m.role === 'agentProgress') {
      // Serialize agentic turn as a summary
      const steps = m.steps || [];
      if (steps.length > 0) {
        const stepSummary = steps.map((s) => `${s.tool}: ${s.summary || 'done'}`).join(', ');
        history.push({
          role: 'assistant',
          content: `[Agent used ${steps.length} tool${steps.length !== 1 ? 's' : ''}: ${stepSummary}]`,
        });
      }
    } else if (m.role === 'error') {
      history.push({ role: 'assistant', content: `[Error: ${m.text || 'unknown error'}]` });
    }
    // Skip 'progress' messages — not relevant for AI context
  }

  // Smart trimming: keep the most valuable messages for context.
  // Priority: user messages > recent messages > proposals/errors > status summaries.
  const MAX_MESSAGES = 20;
  const MAX_CHARS = 12000;

  if (history.length <= MAX_MESSAGES) return history;

  // Score each message: higher = more worth keeping
  const scored = history.map((m, i) => {
    let score = 0;
    // User messages are high-value (contain instructions)
    if (m.role === 'user') score += 5;
    // Assistant messages with substance
    else if (m.role === 'assistant' && m.content?.length > 50) score += 3;
    // Short status lines are low-value
    else score += 1;
    // First user message is critical (original intent)
    if (m.role === 'user' && i === history.findIndex((h) => h.role === 'user')) score += 4;
    // Landing context is the user's original project brief and uploaded materials.
    if (m.role === 'user' && isLandingAgentContextText(m.content)) score += 10;
    // Attached source context should survive trimming so future Agent turns can
    // still ground on recently supplied materials.
    if (m.role === 'user' && isAgentSourceContextText(m.content)) score += 8;
    // Recent messages are more relevant (last 6)
    if (i >= history.length - 6) score += 4;
    // Proposals and errors carry decision context
    if (m.content?.startsWith('[PROPOSAL')) score += 2;
    if (m.content?.includes('FAILED') || m.content?.includes('Error')) score += 2;
    return { ...m, _idx: i, _score: score };
  });

  // Sort by score descending, keep top MAX_MESSAGES
  const sorted = [...scored].sort((a, b) => b._score - a._score);
  const kept = new Set(sorted.slice(0, MAX_MESSAGES).map((m) => m._idx));

  // Build result in original order, respecting char budget
  const result = [];
  let chars = 0;
  for (let i = 0; i < history.length; i++) {
    if (!kept.has(i)) continue;
    const len = (history[i].content || '').length;
    if (chars + len > MAX_CHARS && result.length >= 6) break;
    result.push(history[i]);
    chars += len;
  }
  return result;
}
