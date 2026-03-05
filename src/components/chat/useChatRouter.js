import { useState, useRef, useEffect, useCallback } from 'react';
import { parseFiles } from '../../lib/fileParser';
import { generateSuggestions } from '../../lib/revisionSuggestions';

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
async function streamChat(messages, systemPrompt, signal, apiKey, provider, modelId) {
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
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
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
        max_tokens: 2048,
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
      max_completion_tokens: 2048,
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

// ═══════════════════════════════════════════════════════════════════════════
// useChatRouter — Unified hook for Ask (help AI) + Revise (course map edits)
// ═══════════════════════════════════════════════════════════════════════════
export default function useChatRouter({
  apiKey, provider, modelId,
  courseMap, activeTab,
  onRevision, onDeliverableRevision,
  isStopped, onResume,
  savedMessages, onMessagesChange,
}) {
  const [messages, setMessages] = useState(savedMessages || []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState('ask'); // 'ask' | 'revise'
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const abortRef = useRef(null);

  // Auto-switch mode based on context
  useEffect(() => {
    if (courseMap) setMode('revise');
    else setMode('ask');
  }, [!!courseMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync messages to parent for persistence
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => { onMessagesChangeRef.current = onMessagesChange; });
  useEffect(() => {
    if (onMessagesChangeRef.current) onMessagesChangeRef.current(messages);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Resume stopped generation
    if (mode === 'revise' && isStopped && onResume && attachedFiles.length === 0) {
      setMessages(prev => [...prev, { role: 'user', text: trimmed }, { role: 'assistant', text: 'Resuming...' }]);
      onResume();
      return;
    }

    if (mode === 'ask') {
      await sendHelpMessage(trimmed);
    } else {
      await sendRevision(trimmed);
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

  // ── Revise mode: pass to revision handler ─────────────────────────────────
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
    setSuggestions([]);
    const updatedMessages = [...messages, { role: 'user', text: displayText }];
    setMessages(updatedMessages);

    const isDeliverableTab = activeTab && activeTab !== 'courseMap';
    const handler = isDeliverableTab && onDeliverableRevision ? onDeliverableRevision : onRevision;

    const chatHistory = updatedMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10);

    try {
      const result = await handler(fullMessage, chatHistory);
      const assistantReply = result?.chatReply || 'Updated! Review the changes in the workspace.';
      setMessages(prev => [...prev, { role: 'assistant', text: assistantReply }]);

      if (courseMap) {
        const chips = generateSuggestions(courseMap, assistantReply);
        setSuggestions(chips);
      }
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
  function addProgressMessage(data) {
    setMessages(prev => [...prev, { role: 'progress', ...data }]);
  }

  return {
    messages, mode, setMode,
    isStreaming, send, handleStop,
    attachedFiles, processFiles, removeAttached, isParsing,
    suggestions, setSuggestions,
    addProgressMessage,
  };
}
