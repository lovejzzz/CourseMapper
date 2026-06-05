import React, { useState, useRef, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import { getSecure } from '../lib/secureStorage';
import { supportsCustomTemperature } from '../lib/agentProviders';
import { getGoogleModelBaseUrl } from '../lib/googleProvider';
import {
  buildOpenAIResponsesBody,
  parseOpenAIResponsesStreamChunk,
  prefersOpenAIResponsesApi,
} from '../lib/openaiProvider';

function getSystemPrompt(courseMap, activeTab) {
  let contextSection = '';

  if (courseMap) {
    const courseTitle = courseMap.courseName || 'Untitled Course';
    const lessons = courseMap.lessons || [];
    const lessonList = lessons.map((l, i) => `${i + 1}. ${l.title || 'Untitled Lesson'}`).join('\n');

    contextSection = `
## CURRENT USER CONTEXT (CRITICAL)
The user is currently actively working on a course inside Course Mapper. YOU MUST ACT AS A PEDAGOGICAL CO-PILOT for this specific course.

**Course Title:** ${courseTitle}
**Semester/Level:** ${courseMap.semester || 'Not specified'}
**Number of Lessons:** ${lessons.length}

**Course Outline:**
${lessonList}

${activeTab ? `**User's Current View:** They are currently looking at the \`${activeTab}\` screen/deliverable.` : ''}

**YOUR DUAL ROLE:**
1. **Platform Support:** Answer questions about how to use the Course Mapper tool (exporting, editing, adding models, etc.).
2. **Pro-Level Pedagogical Tutor:** Because you know their course context above, proactively offer to help them brainstorm engaging activities, write better learning objectives, analyze the course for gaps, or explain difficult concepts specific to *their* course subject. If they ask a general teaching question like "Give me an icebreaker," tailor it specifically to the ${courseTitle} curriculum!
`;
  } else {
    contextSection = `
## CURRENT USER CONTEXT
The user has not yet created or opened a course. You are in general platform support mode.

**YOUR ROLE:**
As the Course Mapper Help Assistant, answer questions about how to use the tool, what it does, how to attach an AI API key, and how to get started building their first course.
`;
  }

  return `You are the Course Mapper Help Assistant & Pedagogical Tutor — a friendly, highly-knowledgeable AI embedded directly inside the Course Mapper workspace. Your job is to answer questions about the platform AND act as an expert instructional design co-pilot.

${contextSection}

## What is Course Mapper?
Course Mapper is a free, browser-based tool that uses AI to transform course descriptions or syllabi into a complete set of teaching materials. It generates a structured Course Map spreadsheet, plus Lesson Plans, Slide Decks, Assignment Briefs, Rubrics, Discussion Prompts, Quiz & Exam Banks, Study Guides, and a Syllabus — all from a single prompt or uploaded document. Everything runs in the browser — no installation needed, no backend server.

## Getting Started
- Visit the website. It works in Chrome, Firefox, Safari, or Edge.
- **Option A — type a course description:** Just describe your course (e.g. "Social Policy and Welfare, 14-week undergraduate course") and click Continue.
- **Option B — upload a syllabus:** Drag-and-drop or browse to upload course files. The AI extracts the lesson count and structure automatically.
- **Option C — try a sample:** Click one of the three rotating sample prompts to test different topics, course lengths, and teaching formats.
- Choose an AI provider (OpenAI, Anthropic, Google, or DeepSeek) and enter your API key.
- Select which deliverables to generate (Course Map, Lesson Plans, Slide Decks, etc.)
- Click Generate and watch everything build in real time.

## Supported File Types
Documents: .docx, .doc, .pdf, .txt, .rtf, .odt, .md
Spreadsheets: .xlsx, .xls, .csv, .ods
Presentations: .pptx, .ppt, .odp
Other: .html, .epub, .zip (archives containing any of the above)
Multiple files can be uploaded at once — the AI combines them all.

## AI Models
You need to provide your own API key from one of these providers:
- **OpenAI:** GPT-4o, GPT-4o-mini, o3-mini. Best for highest quality.
- **Anthropic:** Claude 3.7 Sonnet, Claude 3.5 Haiku. Excellent at structured formatting.
- **Google:** Gemini 2.5 Pro, Gemini 2.5 Flash. Best quality with Gemini 2.5 Pro.
- **DeepSeek:** DeepSeek chat/reasoning models. Strong low-cost structured generation.

To get an API key:
- **OpenAI:** Visit https://platform.openai.com/api-keys
- **Anthropic:** Visit https://console.anthropic.com/settings/keys
- **Google:** Visit https://aistudio.google.com/apikey
- **DeepSeek:** Visit https://platform.deepseek.com/api_keys

## Deliverables
After generating the Course Map, Course Mapper can generate up to 8 additional deliverables:
1. **Lesson Plans** — detailed weekly plans with objectives, activities, materials, formative checks, homework, and instructor notes.
2. **Slide Decks** — full presentation decks for each lesson with title slides, agenda, content, activity, and summary slides.
3. **Assignment Briefs** — structured assignments with descriptions, objectives, grading criteria, format requirements.
4. **Rubrics** — assessment rubrics with criteria, performance levels, Bloom's alignment, and grading scales.
5. **Discussion Prompts** — facilitated discussion questions with context, follow-up probes, evaluation criteria.
6. **Quiz & Exam Bank** — tiered question banks with multiple-choice, short-answer, and essay questions.
7. **Study Guides** — student-facing study materials with key terms, concept connections, practice activities.
8. **Syllabus** — a complete course syllabus assembled from the generated content.

## Editing Deliverables
- **Course Map:** Click any cell to edit. Hover for add/delete buttons.
- **Slide Decks:** Click any text on the slide to edit — titles, bullets, course name, timer, speaker notes.
- **All deliverables:** Click any text field to edit it directly. Changes are saved immediately.
- When you edit the course map, a banner appears showing which lessons were modified. You can do a **surgical re-sync** that only regenerates the affected lessons.

## Export
The Export panel appears on the right side of the workspace once generation is complete. It has two modes:
- **Current tab** — exports only the deliverable you are viewing (.pptx, .xlsx, .docx, .pdf, .csv, Google Sheets/Docs/Slides).
- **All tab** — exports everything at once as a ZIP or saves a .coursemapper project file.

## Session Save & Restore
- Work is automatically saved in the browser's local storage.
- **Save .coursemapper** creates a portable project file you can share or archive.

## AI Revision (Chat)
Below each deliverable, there's a chat box labeled "Ask for revisions." Type requests in plain English and the AI updates the content.

## Important Rules for You
- Be concise, warm, and helpful. Use simple language.
- If you don't know something, say so honestly rather than guessing.
- Format responses with markdown for readability (bold, lists, etc.).
- If the user seems confused about pedagogical concepts, offer step-by-step guidance.`;
}

function getSuggestedQuestions(courseMap) {
  if (courseMap) {
    return [
      'Can you review my course map for any pedagogical gaps?',
      'Suggest an engaging active learning activity for Lesson 3.',
      'How do I export this to Google Docs?',
      'What other deliverables should I generate for this course?',
    ];
  }
  return [
    'How do I get started?',
    'What deliverables can I generate?',
    'How do I create a custom deliverable?',
    'How do I get an API key?',
    'How do I export to Google Slides?',
    'Is my data private and secure?',
  ];
}

// ── Read user's configured API key and provider from localStorage ──
function getUserConfig() {
  try {
    const apiKey = getSecure('coursemapper-apikey') || '';
    let provider = 'google'; // default
    const raw = localStorage.getItem('coursemapper-project');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.provider && saved.provider !== 'free') provider = saved.provider;
    }
    // Also try to read modelId for the chat
    let modelId = '';
    if (raw) {
      const saved = JSON.parse(raw);
      modelId = saved.modelId || '';
    }
    return { apiKey, provider, modelId };
  } catch {
    return { apiKey: '', provider: 'google', modelId: '' };
  }
}

// ── Simple streaming call to user's configured provider ──
async function streamChat(messages, systemPrompt, signal) {
  const { apiKey, provider, modelId } = getUserConfig();
  if (provider !== 'webllm' && !apiKey) throw new Error('NO_API_KEY');

  // Pick a lightweight model for chat if modelId isn't available
  const chatModel =
    modelId ||
    (provider === 'openai'
      ? 'gpt-4o-mini'
      : provider === 'anthropic'
        ? 'claude-3-5-haiku-20241022'
        : provider === 'deepseek'
          ? 'deepseek-chat'
          : 'gemini-2.0-flash');

  // WebLLM: local browser inference
  if (provider === 'webllm') {
    const { getEngine } = await import('../lib/webllm');
    const engine = await getEngine(chatModel);
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const asyncIter = await engine.chat.completions.create({
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: 2048,
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

  // OpenAI-compatible providers (OpenAI, DeepSeek)
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tempSetting = supportsCustomTemperature(chatModel) ? { temperature: 0.4 } : {};
  const useResponses = provider === 'openai' && prefersOpenAIResponsesApi(chatModel);
  const response = await fetch(
    useResponses
      ? 'https://api.openai.com/v1/responses'
      : `${provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        useResponses
          ? buildOpenAIResponsesBody({
              model: chatModel,
              systemPrompt,
              userPrompt: messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
              maxOutputTokens: 2048,
              temperature: tempSetting.temperature,
              stream: true,
            })
          : {
              model: chatModel,
              messages: openaiMessages,
              ...(provider === 'deepseek' ? { max_tokens: 2048 } : { max_completion_tokens: 2048 }),
              ...tempSetting,
              stream: true,
            },
      ),
      signal,
    },
  );
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

// ── Shared chat engine ──────────────────────────────────────────────────────
function useHelpChat(courseMap, activeTab) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  async function sendMessage(text) {
    if (!text.trim() || isStreaming) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const chatMessages = newMessages.slice(-20);
      const systemPrompt = getSystemPrompt(courseMap, activeTab);
      const { reader, parseChunk } = await streamChat(chatMessages, systemPrompt, controller.signal);

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
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
          if (last?.role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, content: last.content + '\n\n*(stopped)*' };
            return updated;
          }
          return prev;
        });
        return;
      }
      const isNoKey = err.message === 'NO_API_KEY';
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: isNoKey
            ? "To use the help chat, please configure your AI provider and API key first in the main app. You'll need an API key from OpenAI, Anthropic, Google, or DeepSeek."
            : "I'm sorry, I couldn't process that right now. Please check that your API key is valid and try again.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  return { messages, input, setInput, isStreaming, sendMessage, handleStop };
}

// ── Chat UI (shared between full-page and drawer) ───────────────────────────
function ChatBody({ messages, input, setInput, isStreaming, sendMessage, handleStop, compact = false, courseMap }) {
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const suggestedQuestions = getSuggestedQuestions(courseMap);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
    setInput('');
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-3 px-4" style={{ minHeight: 0 }}>
        {messages.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center h-full ${compact ? 'pt-8' : 'pt-16'} animate-fade-up`}
          >
            <div
              className={`${compact ? 'w-10 h-10 mb-3' : 'w-16 h-16 mb-6'} rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center`}
            >
              <svg
                className={`${compact ? 'w-5 h-5' : 'w-8 h-8'} text-indigo-400`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-slate-700 mb-1.5`}>How can I help?</h2>
            <p className={`${compact ? 'text-[11px] mb-4' : 'text-sm mb-8'} text-slate-400 text-center max-w-md`}>
              Ask me about features, exporting, editing, AI models, and more.
            </p>
            <div className={`grid ${compact ? 'grid-cols-1 gap-1.5' : 'grid-cols-2 gap-2'} max-w-lg w-full`}>
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    sendMessage(q);
                  }}
                  className={`tactile text-left ${compact ? 'px-3 py-2 rounded-lg text-[11px]' : 'px-4 py-3 rounded-xl text-xs'} font-medium text-slate-500 bg-white/50 border border-slate-200/30 hover:bg-indigo-50/60 hover:border-indigo-200/40 hover:text-indigo-600 shadow-glass hover:shadow-glow-indigo transition-all duration-300`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatBubble
                key={i}
                role={msg.role}
                content={msg.content}
                isLast={i === messages.length - 1}
                isStreaming={isStreaming}
                compact={compact}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="pt-2 pb-3 px-4 border-t border-slate-200/30 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            disabled={isStreaming}
            className={`flex-1 ${compact ? 'px-3 py-2.5 text-[12px]' : 'px-5 py-3.5 text-sm'} rounded-pill text-slate-700 bg-white/60 border border-slate-200/40 focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white/90 focus:outline-none shadow-glass transition-all duration-300 placeholder:text-slate-400 disabled:opacity-60`}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className={`tactile ${compact ? 'px-3 py-2.5 text-[12px]' : 'px-5 py-3.5 text-sm'} rounded-pill font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all duration-300`}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className={`tactile btn-glow ${compact ? 'p-2.5' : 'px-5 py-3.5'} rounded-pill text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/20 hover:shadow-glow-violet hover:brightness-[1.06] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <svg
                className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          )}
        </form>
        <p className="text-[9px] text-slate-400 mt-1.5 text-center">
          Powered by your configured AI provider — answers may occasionally be inaccurate
        </p>
      </div>
    </div>
  );
}

// ── HelpDrawer: embeddable slide-over panel ─────────────────────────────────
export function HelpDrawer({ isOpen, onClose, courseMap, activeTab }) {
  const chat = useHelpChat(courseMap, activeTab);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
      <div className="fixed inset-0 z-[55] flex justify-end animate-spring-in" data-print="hide">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
        {/* Panel */}
        <div className="relative w-full max-w-md bg-white/95 backdrop-blur-xl border-l border-slate-200/60 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Help</h2>
                <p className="text-[10px] text-slate-400">Ask anything about Course Mapper</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close help drawer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Chat body */}
          <ChatBody {...chat} compact courseMap={courseMap} />
        </div>
      </div>
    </FocusTrap>
  );
}

// ── Full-page FAQ (still used for #/faq route) ──────────────────────────────
export default function FaqChatbot() {
  const chat = useHelpChat(null, null);

  return (
    <div className="min-h-screen mesh-bg noise-overlay flex flex-col">
      {/* Header */}
      <header className="relative pt-8 pb-6 px-8 max-w-4xl mx-auto w-full">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="#/" className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative w-10 h-10 rounded-[12px] bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white/95" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                  <path
                    d="M4 12a1 1 0 011-1h8a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                  <path
                    d="M4 19a1 1 0 011-1h5a1 1 0 011 1v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-1z"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                  <path
                    d="M19 14l-2 2 2 2"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="18" cy="18" r="1" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
            </a>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
                Course Mapper <span className="text-gradient">Help</span>
              </h1>
              <p className="text-slate-400 text-[12px] font-medium mt-0.5">Ask me anything about using Course Mapper</p>
            </div>
          </div>
          <a
            href="#/"
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-[11px] font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass hover:shadow-glass-lg transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to App
          </a>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pb-4 flex flex-col min-h-0">
        <ChatBody {...chat} courseMap={null} />
      </main>
      <footer className="max-w-4xl mx-auto px-8 py-3 text-center">
        <p className="text-[10px] text-slate-300/70">
          Built by{' '}
          <a href="#/contact" className="font-medium hover:text-indigo-500 transition-colors">
            Tian Xing
          </a>
        </p>
      </footer>
    </div>
  );
}

function ChatBubble({ role, content, isLast, isStreaming, compact = false }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-spring-in">
        <div
          className={`max-w-[80%] ${compact ? 'px-3 py-2 text-[12px]' : 'px-4 py-3 text-sm'} rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white leading-relaxed shadow-lg shadow-indigo-500/10`}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-spring-in">
      <div className={`flex gap-2.5 max-w-[85%]`}>
        <div
          className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm`}
        >
          <svg
            className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-indigo-500`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <div
          className={`${compact ? 'px-3 py-2 text-[12px]' : 'px-4 py-3 text-sm'} rounded-2xl rounded-bl-md bg-white/70 border border-slate-200/40 shadow-glass text-slate-700 leading-relaxed`}
        >
          {content ? (
            <FormattedContent text={content} />
          ) : isLast && isStreaming ? (
            <div className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          ) : null}
          {isLast && isStreaming && content && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}

function FormattedContent({ text }) {
  const lines = text.split('\n');
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.match(/^#{1,3}\s/)) {
      const cleaned = line.replace(/^#{1,3}\s*/, '');
      elements.push(
        <div key={i} className="font-bold text-slate-800 mt-2 mb-1">
          {formatInline(cleaned)}
        </div>,
      );
      continue;
    }

    if (line.match(/^[-*]\s/)) {
      const cleaned = line.replace(/^[-*]\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
          <span>{formatInline(cleaned)}</span>
        </div>,
      );
      continue;
    }

    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1];
      const cleaned = line.replace(/^\d+\.\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 font-semibold flex-shrink-0">{num}.</span>
          <span>{formatInline(cleaned)}</span>
        </div>,
      );
      continue;
    }

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    elements.push(<div key={i}>{formatInline(line)}</div>);
  }

  return <>{elements}</>;
}

function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-800">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return (
          <code key={`${i}-${j}`} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">
            {cp.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${i}-${j}`}>{cp}</span>;
    });
  });
}
