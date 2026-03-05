import { useState, useRef, useEffect, useCallback } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { buildAgentSystemPrompt } from '../../lib/agentPrompts';

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

  const chatModel = modelId || (
    provider === 'openai' ? 'gpt-4o-mini' :
      provider === 'anthropic' ? 'claude-3-5-haiku-20241022' :
        'gemini-2.0-flash'
  );

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

// ── Parse agent JSON response ────────────────────────────────────────────────
function parseAgentJSON(text) {
  if (!text) return null;
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  // Find JSON start
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  // Find matching end brace
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
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
      const optionList = options.map(o =>
        `${o.label}. "${o.title}" → ${o.action?.type || 'unknown'} on ${o.action?.featureId || 'unknown'}`
      ).join('; ');

      if (m.status === 'selected') {
        const chosen = options.find(o => o.label === m.selectedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. User selected option ${m.selectedLabel}: "${chosen?.title || '?'}". Action executed successfully.]`,
        });
      } else if (m.status === 'failed') {
        const failedOpt = options.find(o => o.label === m.failedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. User tried option ${m.failedLabel}: "${failedOpt?.title || '?'}" but it FAILED: ${m.failedMessage || 'unknown error'}. Other options still available.]`,
        });
      } else if (m.status === 'dismissed') {
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. User dismissed the proposal.]`,
        });
      } else {
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. Awaiting user selection.]`,
        });
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
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the help chat, please configure your AI provider and API key first.'
            : "Sorry, I couldn't process that. Please check your API key and try again.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  // ── Agent mode: stream and parse structured JSON response ─────────────────
  async function sendAgentMessage(text) {
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

    // Add user message + animated dots placeholder (empty text triggers bounce animation in MessageBubble)
    setMessages(prev => [...prev, { role: 'user', text: displayText }, { role: 'assistant', text: '' }]);
    setIsStreaming(true);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      // Build chat history for context — include proposals so the agent has memory
      const chatHistory = buildAgentChatHistory(messages);
      chatHistory.push({ role: 'user', content: fullMessage });

      const systemPrompt = buildAgentSystemPrompt(courseMap, activeTab, delivRef.current);
      const { reader, parseChunk } = await streamChat(
        chatHistory, systemPrompt, controller.signal, apiKey, provider, modelId,
        4096, // higher max tokens for structured output
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

              // Periodically detect response type and update UI
              if (chunkCount % 8 === 0) {
                if (!detectedType) {
                  const lower = fullText.toLowerCase();
                  if (lower.includes('"chatreply"')) detectedType = 'chatReply';
                  else if (lower.includes('"proposal"')) detectedType = 'proposal';
                  else if (lower.includes('"actions"')) detectedType = 'batchAction';
                  else if (lower.includes('"action"')) detectedType = 'action';
                  else if (lower.includes('"patches"')) detectedType = 'patches';
                }

                if (detectedType === 'chatReply') {
                  // Live-stream the chatReply value like help mode
                  const match = fullText.match(/"chatReply"\s*:\s*"([\s\S]*?)(?:"|$)/);
                  if (match) {
                    const partial = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    setMessages(prev => {
                      const u = [...prev];
                      u[u.length - 1] = { role: 'assistant', text: partial };
                      return u;
                    });
                  }
                } else if (detectedType === 'proposal') {
                  setMessages(prev => {
                    const u = [...prev];
                    if (!u[u.length - 1].text || u[u.length - 1].text === 'Thinking...') {
                      u[u.length - 1] = { role: 'assistant', text: 'Generating options...' };
                    }
                    return u;
                  });
                } else if (detectedType === 'action' || detectedType === 'batchAction') {
                  setMessages(prev => {
                    const u = [...prev];
                    if (!u[u.length - 1].text || u[u.length - 1].text === 'Thinking...') {
                      u[u.length - 1] = { role: 'assistant', text: 'Preparing changes...' };
                    }
                    return u;
                  });
                } else if (!detectedType && chunkCount >= 16) {
                  // Fallback: show thinking after enough chunks with no detection
                  setMessages(prev => {
                    const u = [...prev];
                    if (!u[u.length - 1].text) {
                      u[u.length - 1] = { role: 'assistant', text: 'Thinking...' };
                    }
                    return u;
                  });
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      // Parse the complete response
      handleAgentResponse(fullText);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.text) return prev.slice(0, -1);
          return prev;
        });
        return;
      }
      const isNoKey = err.message === 'NO_API_KEY';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the agent, please configure your AI provider and API key first.'
            : "Sorry, I couldn't process that request. Please check your API key and try again.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  // ── Handle parsed agent response ──────────────────────────────────────────
  function handleAgentResponse(fullText) {
    const parsed = parseAgentJSON(fullText);

    if (!parsed) {
      // Couldn't parse JSON — treat as plain text reply
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: fullText || "I couldn't generate a response. Please try rephrasing." };
        return updated;
      });
      return;
    }

    // 1. Chat reply
    if (parsed.chatReply && !parsed.proposal && !parsed.action && !parsed.patches) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply };
        return updated;
      });
      return;
    }

    // 2. Proposal
    if (parsed.proposal) {
      setMessages(prev => {
        const updated = [...prev];
        // Replace the thinking indicator with the proposal
        updated[updated.length - 1] = {
          role: 'proposal',
          proposal: parsed.proposal,
          status: 'pending',
        };
        return updated;
      });
      return;
    }

    // 3. Direct action
    if (parsed.action) {
      const exec = executeActionRef.current;
      if (!exec) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'error', text: 'Action executor not available.' };
          return updated;
        });
        return;
      }
      const result = exec(parsed.action);
      const replyText = result.success
        ? (parsed.message || result.message || 'Done!')
        : `Failed: ${result.message}`;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: replyText };
        return updated;
      });
      return;
    }

    // 4. Batch actions (array of independent actions)
    if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
      const exec = executeActionRef.current;
      if (!exec) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'error', text: 'Action executor not available.' };
          return updated;
        });
        return;
      }

      const total = parsed.actions.length;
      let successCount = 0;
      const failures = [];

      for (let i = 0; i < total; i++) {
        const result = exec(parsed.actions[i]);
        if (result.success) {
          successCount++;
        } else {
          failures.push(result.message);
        }
        // Update progress every few actions
        if ((i + 1) % 3 === 0 || i === total - 1) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              text: `Applying ${i + 1} of ${total} changes...`,
            };
            return updated;
          });
        }
      }

      // Final summary
      const replyText = successCount === total
        ? (parsed.message || `Done! Applied ${total} changes successfully.`)
        : successCount === 0
          ? `All ${total} changes failed. ${failures[0] || ''}`
          : `Applied ${successCount} of ${total} changes. ${failures.length} failed: ${failures.join('; ')}`;

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: replyText };
        return updated;
      });
      return;
    }

    // 5. Patches (backward compatible with revision system)
    if (parsed.patches && onRevision) {
      // Route through the existing revision handler
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: 'Applying changes...' };
        return updated;
      });
      // We need to pass the patches through the revision handler
      // For now, apply as a revision text that includes the patches
      onRevision(JSON.stringify(parsed), messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10))
        .then(result => {
          const reply = result?.chatReply || 'Changes applied! Review them in the workspace.';
          setMessages(prev => {
            const updated = [...prev];
            // Find the "Applying changes..." message and replace it
            const idx = updated.findLastIndex(m => m.role === 'assistant' && m.text === 'Applying changes...');
            if (idx >= 0) updated[idx] = { role: 'assistant', text: reply };
            return updated;
          });
        })
        .catch(err => {
          setMessages(prev => [...prev, { role: 'error', text: `Patch failed: ${err.message}` }]);
        });
      return;
    }

    // Fallback: couldn't determine response type
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply || parsed.message || fullText };
      return updated;
    });
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

    const result = exec(option.action);

    setMessages(prev => {
      const updated = [...prev];
      if (result.success) {
        // Success: mark selected, clear any previous failure, add confirmation
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'selected',
          selectedLabel: optionLabel,
          failedLabel: null,
          failedMessage: null,
        };
        updated.push({ role: 'assistant', text: `Done! Added "${option.title}" to your course.` });
      } else {
        // Failure: mark failed option but keep others clickable
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'failed',
          failedLabel: optionLabel,
          failedMessage: result.message,
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

  return {
    messages,
    isStreaming, send, handleStop,
    attachedFiles, processFiles, removeAttached, isParsing,
    addProgressMessage,
    handleSelectProposal,
  };
}
