import React from 'react';

const releases = [
  {
    version: '0.4',
    date: 'March 4, 2026',
    title: 'Token Optimization — Faster, Cheaper AI Generation',
    highlights: [
      'Up to 25% lower API costs through minified JSON keys and smarter chunking',
      '15–20% fewer API calls via adaptive per-deliverable chunk sizes',
      'Subsequent chunks use compact schema references instead of repeating full specifications',
    ],
    sections: [
      {
        label: 'Performance',
        icon: '⚡',
        color: 'amber',
        items: [
          'JSON Key Minification — AI output uses short keys (e.g. "lt" instead of "lessonTitle"), expanded client-side. Saves ~15–25% output tokens across all deliverables.',
          'Adaptive Chunk Sizes — deliverables with simpler output structures (discussions, FAQ, study guides) now chunk more lessons per API call. Reduces total calls from ~22 to ~16 for a 15-lesson course.',
          'Schema Abbreviation for Chunks 1+ — subsequent chunks receive a compact JSON skeleton instead of the full verbose schema, saving ~6,000–10,000 input tokens per generation run.',
          'Per-Feature Output Budgets — each deliverable type gets a right-sized max_tokens limit (e.g. 5K for FAQ, 12K for slide decks) to prevent overgeneration and reduce retry frequency.',
          'Style Exemplar Compression — cross-chunk style references now send a 1-item skeleton (~1,200 chars) instead of full raw JSON (~3,000 chars), saving ~500 input tokens per chunk.',
          'Rubrics as Whole-Course — rubrics now generate in a single API call instead of chunked, eliminating 2 redundant calls and producing more coherent cross-assignment rubrics.',
          'Empty Payload Filtering — course map serialization skips empty strings and empty arrays, reducing input token waste.',
          'Quiz Bank Null Field Omission — question types only include applicable fields (no more null placeholders for MC options on essay questions), saving ~15–20% quiz output tokens.',
        ],
      },
      {
        label: 'Infrastructure',
        icon: '⚙',
        color: 'slate',
        items: [
          'New keyMaps.js module provides bidirectional key mapping for all 8 deliverable types with a recursive expandKeys() function.',
          'parallelGenerator.js now exports per-feature chunk sizes and output budgets instead of using hardcoded globals.',
          'deliverablePrompts.js includes a continuation prompt system that detects chunk index and switches to abbreviated prompts automatically.',
        ],
      },
    ],
  },
  {
    version: '0.3',
    date: 'February 27, 2026',
    title: 'BYOK Only, Dynamic Model Token Limits',
    highlights: [
      'Removed all built-in free AI models — users must provide their own API key',
      'Dynamic max output tokens — each model now uses its actual output limit instead of a hardcoded cap',
      'FAQ chatbot uses your configured API key and provider',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Bring Your Own Key (BYOK) — all AI calls now use your personal API key from OpenAI, Anthropic, or Google. No more shared free-tier keys.',
          'Dynamic max output tokens — the system detects each model\'s actual output limit (e.g. 100K for O3, 32K for GPT-4.1, 8K for Claude 3.5) and uses it automatically. Previously hardcoded to 16K for all models.',
          'FAQ help chatbot now uses your configured provider and API key instead of a hardcoded Gemini key.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'API key auto-detection updated — recognizes OpenAI (sk-proj-), Anthropic (sk-ant-), and Google (AIza) key prefixes and auto-switches the provider dropdown.',
          'Google model list now includes actual outputTokenLimit from the API for accurate token allocation.',
          'OpenAI reasoning models (O1, O3, O4-mini) now get 100K output tokens instead of being capped at 16K.',
          'Privacy policy updated — removed OpenRouter/free-tier references, clarified that API keys stay in the browser.',
        ],
      },
    ],
  },
  {
    version: '0.2',
    date: 'February 25, 2026',
    title: 'Column Toggle, Custom Deliverables from Workspace, AI Auto-Config',
    highlights: [
      'Click column labels to enable/disable — AI generation & all exports respect the toggle',
      'Create custom deliverables directly from the workspace via + Add → Create Custom',
      'AI auto-decides tone, style, and length for custom deliverables when not configured',
      'Repeating learning goals merge automatically in the course map preview',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Column enable/disable toggle — click any column pill in Config to toggle it on or off. Disabled columns are dimmed with strikethrough and excluded from AI generation, preview, and all exports (XLSX, DOCX, CSV, PDF, Google Docs/Sheets).',
          'Custom deliverables in workspace — the + Add dropdown now shows previously created custom deliverables under "Your Custom" and a "Create Custom..." button to build new ones without leaving the workspace.',
          'AI auto-config for custom deliverables — when tone, style, or output length are not set, the AI automatically infers the best settings from the course context and other deliverables\' configuration.',
          'Row merge in Course Map Preview — when sections within a lesson share identical values for a column, cells automatically merge (rowSpan) for a cleaner layout. Editing a merged cell updates all sections.',
          'FAQ chatbot updated with column configuration, custom deliverables, and AI auto-config knowledge.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Click/double-click disambiguation on column pills — single click toggles, double click renames, no accidental flicker.',
          'Stale columns ref fixed in edit proposal engine — column config changes are always reflected in AI revision proposals.',
          'Add deliverable dropdown shows clean UI even when all built-in deliverables are selected — orphan divider removed.',
          'Custom deliverable config uses 3-tier fallback: own defaults → sibling deliverable settings → AI auto-decide.',
        ],
      },
    ],
  },
  {
    version: '0.15',
    date: 'February 14, 2026',
    title: 'Google Verification, Privacy & Terms, FAQ Chatbot Updates',
    highlights: [
      'Google OAuth verified — clean consent screen, no scary warnings',
      'Privacy Policy and Terms of Service pages',
      'FAQ chatbot knows about Course Mapper vs. ChatGPT/Claude/Gemini',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Privacy Policy page at #/privacy — covers data handling, third-party providers, Google Drive integration, and no-tracking policy.',
          'Terms of Service page at #/terms — covers AI-generated content disclaimer, intellectual property, acceptable use, and liability.',
          'Footer now links to Privacy Policy and Terms of Service alongside the changelog.',
          'FAQ chatbot updated with "Why Course Mapper vs. ChatGPT/Claude/Gemini" — explains 10 key advantages and honest disclaimers.',
          'FAQ chatbot suggested question: "Why use Course Mapper instead of ChatGPT?"',
          'README updated with value proposition section, Stop & Resume, modern DOCX export details, and edutool.dev URL.',
        ],
      },
      {
        label: 'Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Google OAuth app branding verified — domain ownership confirmed, app published to production. Users see a clean Google consent dialog instead of the "unverified app" warning.',
          'FAQ chatbot free model list updated to match current models: Gemini 2.5 Flash Lite (default), Gemini 2.0 Flash, GPT-OSS 120B, Llama 3.3 70B, DeepSeek R1T Chimera.',
          'FAQ chatbot Google Drive troubleshooting updated — removed outdated "app isn\'t verified" guidance.',
          'FAQ chatbot Google Drive section updated — clearer explanation of drive.file permission scope and revocation.',
          'Modern DOCX export: Calibri font, color-coded headings, 2-column tables, numbered lists, Table of Contents, US Letter page size.',
          'Google Docs export matches DOCX formatting with auto-generated outline.',
        ],
      },
    ],
  },
  {
    version: '0.1',
    date: 'February 13, 2026',
    title: 'Initial Release',
    highlights: [
      'AI-powered syllabus to Course Map generation',
      'Google Sheets & Google Docs export',
      'Resume interrupted generations',
    ],
    sections: [
      {
        label: 'Features',
        icon: '✦',
        color: 'indigo',
        items: [
          'Upload syllabi (PDF, DOCX, XLSX, PPTX, and more) and generate structured Course Maps with AI.',
          'Support for multiple AI providers: OpenAI, Anthropic, and Google.',
          'Real-time streaming preview — watch the Course Map build as the AI generates it.',
          'Customizable columns — add, remove, rename, and reorder columns with drag-and-drop.',
          'Editable cells — click any cell in the Course Map Preview to edit content directly.',
          'Version history with undo — track every change and revert to any previous version.',
          'Revision chat — ask the AI to revise the Course Map with follow-up instructions or file attachments.',
          'Export to XLSX, DOCX, CSV, and PDF with one click.',
          'Export to Google Sheets and Google Docs via OAuth sign-in.',
          'Stop and Resume generation — pause mid-generation and pick up where you left off.',
          'Persistent state — interrupted generations survive page refresh and can be resumed.',
          'FAQ Help chatbot with built-in knowledge of all Course Mapper features.',
        ],
      },
      {
        label: 'Bug Fixes',
        icon: '⚡',
        color: 'amber',
        items: [
          'Fixed Resume not updating Course Map Preview (parsing and merging approach rewritten).',
          'Fixed Resume restarting from scratch when stopped early — now passes raw context to AI.',
          'Fixed stale API key/model when resuming after page refresh for free providers.',
          'Fixed export error messages persisting indefinitely — now auto-clears after 6 seconds.',
          'Fixed Google OAuth redirect_uri_mismatch error configuration.',
        ],
      },
      {
        label: 'Infrastructure',
        icon: '⚙',
        color: 'slate',
        items: [
          'Vite + React SPA with hash-based routing.',
          'All processing runs client-side — no backend server required.',
          'API keys stored in localStorage, never sent to any third-party server.',
        ],
      },
    ],
  },
];

const colorMap = {
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    dot: 'bg-indigo-500',
    icon: 'text-indigo-500',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200/60',
    dot: 'bg-amber-500',
    icon: 'text-amber-500',
  },
  slate: {
    badge: 'bg-slate-50 text-slate-600 border-slate-200/60',
    dot: 'bg-slate-400',
    icon: 'text-slate-500',
  },
};

export default function Changelog() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a
            href="#/"
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Course Mapper
          </a>
          <a
            href="#/faq"
            className="text-slate-400 hover:text-indigo-600 transition-colors text-sm font-medium"
          >
            Help
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        {/* Page title */}
        <div className="mb-16">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Changelog</h1>
          <p className="mt-2 text-slate-500 text-sm">New features, improvements, and fixes for Course Mapper.</p>
        </div>

        {/* Releases */}
        <div className="space-y-20">
          {releases.map((release) => (
            <article key={release.version} className="relative">
              {/* Version header */}
              <div className="flex items-baseline gap-4 mb-8">
                <span className="text-2xl font-bold text-slate-900 tracking-tight">
                  v{release.version}
                </span>
                <span className="text-sm text-slate-400 font-medium">{release.date}</span>
              </div>

              {/* Highlights */}
              {release.highlights && (
                <div className="mb-10 p-5 rounded-2xl bg-gradient-to-r from-indigo-50/80 to-violet-50/60 border border-indigo-100/60">
                  <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3">Highlights</p>
                  <ul className="space-y-2">
                    {release.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sections */}
              <div className="space-y-8">
                {release.sections.map((section) => {
                  const colors = colorMap[section.color] || colorMap.slate;
                  return (
                    <div key={section.label}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`text-base ${colors.icon}`}>{section.icon}</span>
                        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                          {section.label}
                        </h3>
                        <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                          {section.items.length}
                        </span>
                      </div>
                      <ul className="space-y-2.5 pl-1">
                        {section.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                            <span className={`mt-[7px] w-1.5 h-1.5 rounded-full ${colors.dot} flex-shrink-0`} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 py-8">
        <p className="text-center text-xs text-slate-400">
          Course Mapper &mdash; Transform syllabi into structured course maps with AI.
        </p>
      </footer>
    </div>
  );
}
