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
  buildAgentRequest, parseAgentResponse as parseProviderResponse,
} from '../../lib/agentProviders';

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
export async function streamChat(messages, systemPrompt, signal, apiKey, provider, modelId, maxTokens = 2048) {
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

  // OpenAI / DeepSeek (OpenAI-compatible)
  const baseUrl = provider === 'deepseek'
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];
  const response = await fetch(baseUrl, {
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
export async function fetchAgentResponseNative(loopMessages, systemPrompt, signal, apiKey, provider, modelId, nativeTools) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!modelId) throw new Error('NO_MODEL_SELECTED');

  let temperature = 0.4;

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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API error: ${response.status}`;
      // If model doesn't support custom temperature, retry with default (1)
      if (response.status === 400 && tempRetry === 0 && /temperature/i.test(msg)) {
        console.log('[CM] Model does not support custom temperature, retrying with default');
        temperature = undefined;
        continue;
      }
      throw new Error(msg);
    }

    const json = await response.json();
    return parseProviderResponse(provider, json);
  }
}

// ── Build chat history with agent memory ─────────────────────────────────────
// Converts proposals, actions, and errors into assistant messages so the AI
// knows what it previously proposed, what the user selected, and what succeeded.
export function buildAgentChatHistory(messages) {
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
