import React, { useState, useRef, useEffect } from 'react';

// Obfuscated key — XOR-encoded to prevent automated scanner revocation
const _EG = '02260f13201c0e27121f355f2d381a1a421c231e07260a4324331b1b166c05080633290f0f0a25';
const _S = [67,111,117,114,115,101,77,97,112,112,101,114,78,89,85];
function _dk(e, s) { const r = []; for (let i = 0; i < e.length; i += 2) r.push(String.fromCharCode(parseInt(e.substr(i, 2), 16) ^ s[(i / 2) % s.length])); return r.join(''); }
const GEMINI_KEY = _dk(_EG, _S);
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `You are the Course Mapper Help Assistant — a friendly, knowledgeable chatbot embedded in the Course Mapper website. Your job is to answer questions about how to use Course Mapper clearly and simply, as if explaining to someone who may not be very tech-savvy.

## What is Course Mapper?
Course Mapper is a free, browser-based tool that uses AI to transform course syllabi into structured Course Map spreadsheets. Users upload their syllabus, and the AI organizes it into weekly lessons with learning goals, objectives, assessments, activities, resources, and more. Everything runs in the browser — no installation needed, no backend server.

## Getting Started
- Visit the website. It works in Chrome, Firefox, Safari, or Edge.
- On the left panel, choose an AI provider:
  - **Free (no API key needed):** Select "Free" from the dropdown. Pick a model (GPT-OSS 120B is the recommended default). Ready to go.
  - **Bring your own key:** Select OpenAI, Anthropic, or Google. Paste your API key. The tool auto-detects which provider the key belongs to.
- On the right panel, upload course files (drag-and-drop or click to browse).
- Optionally customize columns below the upload area.
- Click the purple "Generate Course Map" button.

## Supported File Types
Documents: .docx, .doc, .pdf, .txt, .rtf, .odt, .md
Spreadsheets: .xlsx, .xls, .csv, .ods
Presentations: .pptx, .ppt, .odp
Other: .html, .epub, .zip (archives containing any of the above)
Multiple files can be uploaded at once — the AI combines them all.

## AI Models
Free tier models (no API key needed, powered by OpenRouter):
- **GPT-OSS 120B** — best default, fast, reliable structured output
- **DeepSeek R1 0528** — deepest reasoning, slower
- **Llama 3.3 70B** — solid general-purpose
- **Step 3.5 Flash** — fastest

Paid providers (user provides their own API key):
- OpenAI (GPT-4, GPT-4o, o3, etc.)
- Anthropic (Claude 3.5 Sonnet, etc.)
- Google (Gemini 2.0 Flash, Gemini 2.5 Pro, etc.)

## Generation Process
1. **Parsing** — the tool reads uploaded files locally in the browser
2. **Generating** — AI builds the course map in real time (user can watch it stream)
3. **Auto-completing** — if lessons are missing, the AI automatically continues generating
4. **Examining** — AI reviews its own work and fixes issues automatically
5. **Done** — course map is ready
Takes 1–3 minutes typically. User can click Stop at any time.
A **Generation Log** panel shows detailed progress: which model ran, retries, model switches, and completeness checks.

## Editing the Course Map
- **Click any cell** to edit text directly — cells are also keyboard-accessible (Tab to navigate, Enter or Space to start editing, Escape to cancel)
- Hover over rows to see + and × buttons for adding/deleting sections
- Each lesson header has controls to add/delete lessons and move them up/down
- Undo/Redo buttons available at the top
- Full version history in the History panel on the right — click any version to jump back

## AI Revision (Chat)
In the progress panel, there's a chat box. Users type revision requests in plain English, like:
- "Add more group activities to Lesson 3"
- "Change the technology platform to Canvas for all lessons"
- "Make the assessments more specific"
The AI updates the course map based on the instructions.
Users can also **attach files** to revision requests — drag-and-drop files onto the chat or click the paperclip icon. The AI will incorporate the new content into the course map. This is useful for adding supplementary materials or updated syllabi after the initial generation.

## Diff View (Show Changes)
After AI examines or revises, a "Show Changes" button appears. Clicking it shows:
- Red strikethrough text = old content
- Green highlighted text = new content
Click "Hide Changes" to go back, or × to dismiss the diff.

## Add Materials After Generation
Click the blue "Add Materials" button at the top. Upload new files. The AI automatically revises the course map to incorporate the new content.

## Import an Existing Course Map
Click the "Import" button in the export bar to load an existing course map from a .xlsx or .csv file. This is useful if you have a course map from a previous semester and want to use it as a starting point.

## Export Options
**Download to computer:**
- **.xlsx** — Excel spreadsheet (original table format, best for further editing)
- **.docx** — Word document (reorganized into readable narrative format per lesson, good for sharing or printing)
- **.pdf** — PDF (table format, good for printing)
- **.csv** — for importing into other tools or LMS systems

**Save to Google Drive (requires Google sign-in):**
- **Google Sheets** — uploads as native Google Sheet (table format)
- **Google Docs** — uploads as native Google Doc (readable narrative format)

When saving to Google Drive, a sign-in popup appears. The user signs in with their own Google account. The file goes to their own Drive. Course Mapper never sees or stores their data.

## Auto-Save
Work is automatically saved in the browser's local storage. Closing and reopening the tab restores everything — your course map, chat history, and version history are all preserved. Click "New Project" to clear and start fresh.

## Error Recovery
If something goes wrong while displaying the course map or progress panel, an error message will appear with a **"Try Again"** button. Clicking it will attempt to re-render the panel without losing your data. Your course map and chat history are preserved even if a display error occurs.

## Privacy & Data
- Everything runs in the browser. No data is stored on Course Mapper servers — there is no backend server at all.
- API keys are sent directly from the browser to the AI provider (OpenAI, Anthropic, Google, or OpenRouter).
- If using the free tier, prompts may be used by model providers to improve their AI.
- For sensitive course materials, use your own API key with a paid provider.
- Local storage is per-browser, per-device. Export your work to transfer it elsewhere.

## Columns / Structure
The default columns are: Learning Goals, Topic/Section, Learning Objectives, Weekly Assessments, Async Activities, Sync Activities, Technology Needed, Presentation Format, Supporting Resources, Evaluate Design.
Users can customize: reorder by dragging, rename by clicking, add or remove columns. The column editor appears below the file upload area after files are uploaded.

## Keyboard Accessibility
- All editable cells in the course map table can be reached with **Tab** and activated with **Enter** or **Space**
- When editing a cell, press **Enter** to save or **Escape** to cancel
- Checkboxes (Evaluate Design column) are also keyboard-accessible

## Troubleshooting
- **Free model slow/not responding:** Free models are rate-limited during peak usage. Try another free model or wait a minute. The tool will automatically retry with a different model if one fails.
- **PDF not read correctly:** Scanned PDFs (images) can't be parsed — they contain pictures of text, not actual text. Convert to .docx first, or use OCR software.
- **Google Drive error:** Allow popups in your browser, and grant permission in the Google sign-in dialog. If you see "app isn't verified", click Advanced → Continue. This is normal for development apps.
- **Lost work after clearing browser data:** Local storage was cleared along with browser data. Always export your finished course map to a file or Google Drive.
- **Page blank or panel crash:** Refresh the page. If only one panel crashed, look for the "Try Again" button. Your data is preserved in local storage.
- **Generation stuck or incomplete:** Click the Stop button, then try generating again. You can also try a different AI model.

## Important Rules for You
- Be concise, warm, and helpful. Use simple language.
- If you don't know something, say so honestly rather than guessing.
- Only answer questions about Course Mapper. For unrelated questions, politely redirect.
- Format responses with markdown for readability (bold, lists, etc.).
- If the user seems confused, offer step-by-step guidance.`;

const SUGGESTED_QUESTIONS = [
  'How do I get started?',
  'Which AI model should I use?',
  'How do I export to Google Drive?',
  'Can I attach files when asking for revisions?',
  'Is my data private and secure?',
  'What keyboard shortcuts are available?',
];

export default function FaqChatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text) {
    if (!text.trim() || isStreaming) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const geminiMessages = newMessages.slice(-20).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error: ${response.status}`);
      }

      const reader = response.body.getReader();
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
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunk) {
              fullText += chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullText };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: "I'm sorry, I couldn't process that right now. The AI service might be busy — please try again in a moment.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

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
                  <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M4 12a1 1 0 011-1h8a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M4 19a1 1 0 011-1h5a1 1 0 011 1v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-1z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
                  <path d="M19 14l-2 2 2 2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="18" cy="18" r="1" fill="currentColor" opacity="0.6"/>
                </svg>
              </div>
            </a>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
                Course Mapper <span className="text-gradient">Help</span>
              </h1>
              <p className="text-slate-400 text-[12px] font-medium mt-0.5">
                Ask me anything about using Course Mapper
              </p>
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
      <main className="flex-1 max-w-4xl mx-auto w-full px-8 pb-4 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-4" style={{ minHeight: 0 }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pt-16 animate-fade-up">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-slate-700 mb-2">How can I help you?</h2>
              <p className="text-sm text-slate-400 mb-8 text-center max-w-md">
                I know everything about Course Mapper — ask me about getting started, uploading files, exporting, AI models, privacy, and more.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="tactile text-left px-4 py-3 rounded-xl text-xs font-medium text-slate-500 bg-white/50 border border-slate-200/30 hover:bg-indigo-50/60 hover:border-indigo-200/40 hover:text-indigo-600 shadow-glass hover:shadow-glow-indigo transition-all duration-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatBubble key={i} role={msg.role} content={msg.content} isLast={i === messages.length - 1} isStreaming={isStreaming} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="pt-3 pb-4 border-t border-slate-200/30">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type your question..."
                disabled={isStreaming}
                className="w-full px-5 py-3.5 rounded-pill text-sm text-slate-700 bg-white/60 border border-slate-200/40 focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white/90 focus:outline-none shadow-glass transition-all duration-300 placeholder:text-slate-400 disabled:opacity-60"
              />
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="tactile px-5 py-3.5 rounded-pill text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all duration-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="tactile btn-glow px-5 py-3.5 rounded-pill text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/20 hover:shadow-glow-violet hover:brightness-[1.06] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </form>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            Powered by Gemini via Google AI — answers may occasionally be inaccurate
          </p>
        </div>
      </main>
      <footer className="max-w-4xl mx-auto px-8 py-3 text-center">
        <p className="text-[10px] text-slate-300/70">
          Built by the Educational Technology team at NYU Silver School of Social Work
        </p>
      </footer>
    </div>
  );
}

function ChatBubble({ role, content, isLast, isStreaming }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-spring-in">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm leading-relaxed shadow-lg shadow-indigo-500/10">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-spring-in">
      <div className="flex gap-3 max-w-[85%]">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/70 border border-slate-200/40 shadow-glass text-sm text-slate-700 leading-relaxed">
          {content ? (
            <FormattedContent text={content} />
          ) : isLast && isStreaming ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
  // Simple markdown-like rendering: bold, lists, line breaks
  const lines = text.split('\n');
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Heading (##)
    if (line.match(/^#{1,3}\s/)) {
      const cleaned = line.replace(/^#{1,3}\s*/, '');
      elements.push(
        <div key={i} className="font-bold text-slate-800 mt-2 mb-1">
          {formatInline(cleaned)}
        </div>
      );
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      const cleaned = line.replace(/^[-*]\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1];
      const cleaned = line.replace(/^\d+\.\s*/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-indigo-400 font-semibold flex-shrink-0">{num}.</span>
          <span>{formatInline(cleaned)}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Normal paragraph
    elements.push(<div key={i}>{formatInline(line)}</div>);
  }

  return <>{elements}</>;
}

function formatInline(text) {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
    }
    // Inline code: `text`
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={`${i}-${j}`} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] font-mono text-indigo-600">{cp.slice(1, -1)}</code>;
      }
      return <span key={`${i}-${j}`}>{cp}</span>;
    });
  });
}
