import React from 'react';
import Header from '../components/Header';

const releases = [
  {
    version: '0.8.1',
    date: 'May 31, 2026',
    title: 'A-Quality Blueprint Compiler Proof',
    highlights: [
      'The course blueprint is now a richer instructional representation with source confidence, teaching moves, review boundaries, and compiler decisions',
      'Gold-sample and expert-review audits now check whether compiler output is classroom-ready, source-faithful, and transparent about what still needs human review',
      'Compact enrichment and instructor preference learning are wired into the compiler path without returning to high-cost generation for the core package',
      'Strict external proof now requires real course-map evidence at a required 5-, 8-, or 14-lesson proof scope before we claim A-quality release readiness',
    ],
    sections: [
      {
        label: 'Blueprint Compiler',
        icon: '✦',
        color: 'indigo',
        items: [
          'Expanded the compact blueprint with course modality, learner context, evidence requirements, success criteria, source anchors, assumption ledgers, package coherence rows, and per-lesson compiler decisions.',
          'Lesson plans, slide decks, assignments, rubrics, discussions, quiz banks, study guides, syllabus, FAQ, and safe custom deliverables now preserve blueprint grounding instead of relying on repeated model calls.',
          'Studio and course-design classifiers now resist false capstone reclassification when a long course ends with a portfolio or final showcase.',
          'The compiler now exposes publish gates, model-use policy, local-review focus, and source-risk cues so instructors can see which parts are ready and which parts require confirmation.',
          'Syllabus trust receipts and course-at-a-glance rows now use compact proof summaries instead of copying full internal blueprint maps into user-facing materials.',
        ],
      },
      {
        label: 'Quality Proof',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added audit:gold for curated classroom-quality regression checks across blueprint maturity, source fidelity, decode losslessness, instructional alignment, modality fit, artifact genre, teaching moves, and enrichment impact.',
          'Expanded the gold-sample matrix to 40 packages and now require short, standard, and full-semester scope proof across multiple teaching modalities before the gate can pass.',
          'Added audit:expert, audit:expert:preflight, audit:expert:external, and audit:expert:packet so internal checks stay separate from external A-quality proof.',
          'External proof packets now include source inputs, compact blueprints, full-package review files, reviewer scorecards, source-fidelity artifact rows, blueprint-quality rows, and assumption-ledger decisions.',
          'Recommended strict-proof bundles now cover 5-, 8-, and 14-lesson scopes across different modalities and show whether the required real external course map is at a valid proof scope.',
          'The strict external gate now blocks real-course proof that is complete but off-scope, so curated samples cannot hide an unproven real-course workflow.',
          'External reviewer fixtures must now match the current package version, preventing stale review packets from certifying a newer compiler build.',
          'Expert proof reports now show current-version fixture coverage and stale fixture IDs as a dedicated readiness item.',
        ],
      },
      {
        label: 'Enrichment and Learning',
        icon: '⚡',
        color: 'amber',
        items: [
          'Added a compact blueprint enrichment pass that can use one source-grounded model call for course-specific phrasing and teaching moves before deterministic compilation.',
          'Rejected generic, drifting, incomplete, or weakly grounded enrichment so the compiler falls back to deterministic output when the enrichment is not safe.',
          'Added deterministic instructor preference profiles from accepted and rejected edits so repeated rubric, slide, quiz, pacing, and wording preferences can influence later compiler output.',
        ],
      },
      {
        label: 'Trust and Cost',
        icon: '⚙',
        color: 'slate',
        items: [
          'Developer Mode now tracks blueprint-enrichment calls alongside course-map, deliverable, repair, retry, fallback, agent, and image calls.',
          'Receipts distinguish deterministic compile, enriched compile, local source-inferred repair, model fallback, and required human review.',
          'The pipeline audit continues to prove the audited core package can compile with zero hybrid model calls while preserving validator and readiness quality.',
        ],
      },
    ],
  },
  {
    version: '0.8',
    date: 'May 26, 2026',
    title: 'Cost-Efficient Hybrid Package Pipeline',
    highlights: [
      'All audited package deliverables can now compile directly from the course blueprint before model generation starts',
      'Package receipts report actual API spend, per-feature spend, and compiler savings after the course is done',
      'The hybrid pipeline audit is now a required regression gate for v0.8+ quality and cost checks',
    ],
    sections: [
      {
        label: 'Hybrid Pipeline',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added deterministic compiler coverage for syllabus, lesson plans, slide decks, assignment briefs, rubrics, discussion prompts, quiz banks, study guides, and Course FAQ so audited package materials no longer require model calls by default.',
          'Lesson plans and discussion prompts now use lesson-specific blueprint phrasing for teaching flow, facilitation guidance, formative checks, participation criteria, and student support.',
          'Quiz banks now compile from reusable assessment atoms with Bloom coverage, point plans, rationales, answer guidance, and a filterable bank index.',
          'Slide decks now compile from a compact intermediate representation with assertion-evidence flow, visual hints, speaker notes, accessibility guidance, and assessment mapping.',
          'The cost plan now accounts for avoided blueprint-compiled generation calls before model tasks are reserved.',
        ],
      },
      {
        label: 'Audit Gate',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'CI now runs npm run audit:pipeline as a required v0.8+ regression gate after deliverable quality audits.',
          'The audit measures baseline calls versus hybrid calls, validator/readiness quality, sparse course-map repairs, and remaining model-call pools.',
          'Sparse course maps now receive deterministic assessment fallbacks before blueprint compilation so missing weekly assessment cells do not collapse downstream deliverables.',
        ],
      },
      {
        label: 'Spend Receipts',
        icon: '⚡',
        color: 'amber',
        items: [
          'API usage events now aggregate spend by feature as well as by run, including repair and regeneration spend against the affected deliverable.',
          'The package handoff card now shows total spend, feature-level spend, and a compiler receipt that names what was compiled from the course map.',
          'Final package messages include the spend summary and compiler savings after finishing checks complete.',
        ],
      },
      {
        label: 'Developer IDE',
        icon: '⚙',
        color: 'slate',
        items: [
          'Developer Mode API budget telemetry now includes a per-feature spend table with cost, token count, and estimated/reported status.',
          'Compiler events now show compiled feature counts and estimated AI calls saved in the recent API event log.',
          'The same budget object powers Developer Mode and the user-facing receipt so debugging matches what instructors see.',
        ],
      },
      {
        label: 'Sample Verification',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added a 14-lesson package comparison test: the audited hybrid path now keeps no core package deliverables on the model pipeline.',
          'The sample reduces initial deliverable model tasks from 25 to 0, saving 25 generation calls before repair reserves.',
          'Compiled lesson-plan, discussion, quiz, slide, syllabus, assignment, rubric, study-guide, and FAQ outputs pass existing deliverable validators and heuristic quality checks before the cost reduction is accepted.',
        ],
      },
    ],
  },
  {
    version: '0.75',
    date: 'May 25, 2026',
    title: 'Output Polish and Cost Telemetry Cleanup',
    highlights: [
      'Rubrics now receive deterministic lesson-specific cleanup when a model falls back to generic grading language',
      'Course FAQ questions are automatically tailored when repeated templates appear across lessons',
      'API budget logs now avoid duplicate trace noise so troubleshooting reflects real provider calls',
    ],
    sections: [
      {
        label: 'Rubric Quality',
        icon: '✦',
        color: 'indigo',
        items: [
          'Rubric prompts now explicitly reject reusable criteria such as “Objective alignment and task completion” unless they include lesson-specific evidence, artifact, method, or decision language.',
          'The package finalizer now rewrites generic rubric criteria and performance descriptors against the course-map assessment anchor before export.',
          'Fallback rubric cells now point to concrete lesson evidence instead of broad “course concepts” language.',
        ],
      },
      {
        label: 'Course FAQ Variety',
        icon: '⚡',
        color: 'amber',
        items: [
          'Course FAQ prompts now ban repeated lesson questions such as “How should I prepare for the assessment in this lesson?”',
          'FAQ post-processing now detects repeated question text across lessons and rewrites it with the lesson assessment, topic, or workflow context.',
          'Fallback FAQ generation now names the actual assessment or lesson title in preparation questions.',
        ],
      },
      {
        label: 'Readiness Accuracy',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Publishability checks now preserve legitimate instructional wording about data-cleaning placeholders while still blocking unresolved “placeholder text/content” markers.',
          'The export-ready path still treats real placeholders, missing fields, unsupported FAQ categories, and incomplete lesson coverage as repair targets.',
        ],
      },
      {
        label: 'Developer Telemetry',
        icon: '⚙',
        color: 'slate',
        items: [
          'API budget tracing now updates from a ref-backed budget path instead of logging inside the React state updater, reducing duplicate console rows during troubleshooting.',
          'Developer Mode call counters remain focused on actual provider attempts: model discovery, credit checks, course map, deliverable chunks, retries, fallbacks, agent loops, and image calls.',
        ],
      },
    ],
  },
  {
    version: '0.7',
    date: 'May 14, 2026',
    title: 'Autonomous Package Finalizer',
    highlights: [
      'Agent finalization now verifies exports, readiness, validation, and safe repairs before handing a package to the user',
      'Localized weak sections can be retried automatically instead of regenerating or asking about the whole course',
      'The main agent path now feels closer to “consider it done”: finish, verify, repair, and hand off',
    ],
    sections: [
      {
        label: 'God-Mode Package Flow',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added a one-step package finalizer that applies safe readiness repairs, verifies export paths, runs package readiness checks, and reruns pedagogical validation before claiming a package is ready.',
          'The final handoff card now reports the package outcome, safe repairs, export status, lesson count, and remaining review items without exposing internal judge scores.',
          'The agent starter now includes a direct “Finish package” path from the generated workspace.',
        ],
      },
      {
        label: 'Autonomous Repair',
        icon: '⚡',
        color: 'amber',
        items: [
          'Added targeted retry for localized weak generated sections, so the agent can regenerate only the affected lesson/deliverable slice when validation finds a concrete local failure.',
          'Auto-review instructions now route through finalization first, then targeted retry or direct safe edits, then finalization again after the updated package lands.',
          'Targeted retry progress is classified honestly in the agent status UI as started, pending, partial, or failed.',
        ],
      },
      {
        label: 'Export Verification',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added in-memory export smoke checks for course-map XLSX, deliverable CSV/DOCX, and slide-deck PPTX generation before the agent marks a package ready.',
          'Export failures now keep the package in Finish package instead of allowing a polished but non-exportable handoff.',
          'The export verifier lazy-loads heavy exporters so bundle budgets remain intact.',
        ],
      },
      {
        label: 'Model Routing and Safety',
        icon: '⚙',
        color: 'slate',
        items: [
          'Added model-routing advice for the agent: stay on the configured low-cost model first, then escalate only after targeted retry cannot clear concrete package issues.',
          'Review-only mode now blocks targeted retry alongside other editing tools while keeping read-only export verification available.',
          'Regression tests cover the finalizer, export verifier, package card, auto-review prompt, review-only filtering, and model-routing advice.',
        ],
      },
    ],
  },
  {
    version: '0.6',
    date: 'May 12, 2026',
    title: 'Quality-Gated Deliverables and Developer IDE Hardening',
    highlights: [
      'Production generation now validates empty outputs, missing lesson coverage, and broken scoring math before export',
      'Lesson Plans and Assignment Briefs use the stronger internally tested prompt patterns for more classroom-ready materials',
      'Developer Mode, exports, CI, and browser regression coverage were hardened across the full Course Mapper workflow',
    ],
    sections: [
      {
        label: 'Deliverable Quality',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added production validation guards that reject empty JSON, missing deliverable arrays, near-empty items, incomplete lesson counts, underfilled Course FAQ outputs, and Quiz Bank scoring mismatches.',
          'Generation now retries invalid whole-course outputs before marking a deliverable complete, so empty rubrics or syllabus responses no longer silently pass.',
          'Final deliverable validation runs before completion, blocking invalid generated materials from being treated as export-ready.',
          'Quiz Bank post-processing repairs missing question points, incorrect totalPoints values, and point-plan math before export.',
          'Rubrics now receive deterministic coverage and support normalization in the whole-course finalization path.',
        ],
      },
      {
        label: 'Prompt Improvements',
        icon: '⚡',
        color: 'amber',
        items: [
          'Lesson Plans now require student-facing before/during/after guidance, submitted artifacts, artifact length, prerequisite knowledge, misconceptions, weekly submission criteria, local-case replacement notes, assessment criteria, and grading calibration cues.',
          'Lesson Plans include a course sequence overview and assessment progression map so instructors can see how weekly artifacts build over the full course.',
          'Assignment Briefs now include a course assignment map, portfolio connection, expected submission file, high-value success criteria, instructor feedback priority, and assignment-specific performance bands.',
          'Assignment prompts now discourage disconnected case tours and push every major task toward a coherent course portfolio sequence.',
          'Additional prompt hardening was added across syllabus, slide decks, rubrics, discussions, quiz bank, study guides, and Course FAQ to reduce boilerplate and improve publication readiness.',
        ],
      },
      {
        label: 'Developer IDE',
        icon: '⚙',
        color: 'violet',
        items: [
          'Developer Mode was split into maintainable panels for prompts, templates, diagnostics, layout, sidebar, and agent logs.',
          'JSON editing moved to a stronger CodeMirror shell with line numbers, JSON highlighting, diagnostics, keyboard shortcuts, and safer scrolling behavior.',
          'Secret diagnostics flag API keys, access tokens, authorization headers, and similar sensitive values before applying or saving snapshots.',
          'Clickable diagnostics map JSON paths to editor locations so issues can be found quickly.',
          'Template and history workflows gained safer import/export, partial patch handling, compressed/bounded storage, and clearer runtime risk diagnostics.',
        ],
      },
      {
        label: 'Exports and Readiness',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Export readiness checks now make completeness problems visible before download.',
          'Critical blockers prevent silent bad exports, while warning-only materials can still be exported after explicit user confirmation.',
          'ZIP and current-tab export smoke tests cover representative formats for syllabus, lesson plans, slide decks, assignments, rubrics, discussions, quiz bank, and study guides.',
          'Agent auto-review now runs in the background without pretending the user typed “Review my course.”',
        ],
      },
      {
        label: 'Testing and Deployment',
        icon: '⚙',
        color: 'slate',
        items: [
          'Added CI gates for formatting, linting, unit tests, production build, bundle budgets, Playwright E2E tests, and Firebase emulator rules tests.',
          'GitHub Pages deployment now waits for CI to pass on main before publishing the live site.',
          'Added permanent E2E coverage for the lazy landing shell, generated workspace mobile layout, Developer IDE diagnostics, agent no-key behavior, all-deliverables terminal states, and export warning flows.',
          'Landing page code now lazy-loads the workspace app so generation hooks, agent tooling, cloud sync, and deliverable machinery do not load until needed.',
        ],
      },
    ],
  },
  {
    version: '0.5',
    date: 'March 5, 2026',
    title: "AI Teaching Agent — Act, Don't Advise",
    highlights: [
      'Agentic AI assistant that takes direct action on your course materials instead of just giving advice',
      'Batch actions across multiple lessons and cross-deliverable edits in a single request',
      'Streaming feedback, error recovery, and agent memory for a responsive editing experience',
    ],
    sections: [
      {
        label: 'AI Agent',
        icon: '✦',
        color: 'indigo',
        items: [
          'Unified ChatPanel replaces the separate ProgressPanel, RevisionChat, and HelpDrawer with a single context-aware interface.',
          'Agent mode auto-activates when deliverables are generated — messages are routed to the agentic assistant automatically.',
          "Proposal cards — the agent proposes 2–3 pedagogically distinct options as clickable cards with expand/collapse descriptions. Pick one and it's instantly applied.",
          'Batch actions — "Add a quiz to every lesson" generates unique, lesson-specific content and applies changes with progress feedback (e.g., "Applying 5 of 12...").',
          'Cross-deliverable edits — "Add a quiz AND a discussion prompt for Lesson 2" handles multiple deliverable types in a single batch.',
          'Streaming progress detection — live-streams chatReply text and shows contextual status messages (Generating options, Preparing changes) while the agent works.',
          'Error recovery — failed proposal options turn red with a retry button, and other options remain clickable. No more stuck proposals.',
          'Agent memory — buildAgentChatHistory serializes proposals, selections, and failures so the AI remembers its own actions within the session.',
          'Undo support — every agent action snapshots the previous deliverable state for one-click undo.',
        ],
      },
      {
        label: 'UX Improvements',
        icon: '🎨',
        color: 'violet',
        items: [
          'Context-aware chat opener — greeting and starter prompts adapt based on app state (onboarding → course map ready → agent mode).',
          'Generation milestone cards now include the opener greeting + clickable starter prompts, so users always see helpful next steps.',
          'Visual highlight — when the agent modifies a deliverable, the affected tab briefly pulses to confirm the change.',
          'Agent badge — the chat input shows a "✦ Agent" indicator when in agent mode.',
          'Chat history persistence — conversation survives tab switches and page reloads via localStorage.',
        ],
      },
      {
        label: 'Robustness',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Revision fallback guard — messages on ungenerated deliverable tabs correctly fall back to course map revision instead of failing silently.',
          'Generation routing guard — messages sent during deliverable generation are routed to help mode instead of being misrouted to revision.',
          'Prompt hardening — "Act, Don\'t Advise" principle prevents the agent from telling users to do things manually.',
        ],
      },
    ],
  },
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
          "Dynamic max output tokens — the system detects each model's actual output limit (e.g. 100K for O3, 32K for GPT-4.1, 8K for Claude 3.5) and uses it automatically. Previously hardcoded to 16K for all models.",
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
          "AI auto-config for custom deliverables — when tone, style, or output length are not set, the AI automatically infers the best settings from the course context and other deliverables' configuration.",
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
    badge: 'bg-slate-100 text-slate-700 border-slate-200/60',
    dot: 'bg-slate-400',
    icon: 'text-slate-600',
  },
  violet: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200/60',
    dot: 'bg-violet-500',
    icon: 'text-violet-500',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-500',
  },
};

export default function Changelog() {
  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header compact />

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 pt-8 pb-24">
        {/* Page title */}
        <div className="mb-16">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Changelog</h1>
          <p className="mt-2 text-slate-600 text-sm">New features, improvements, and fixes for Course Mapper.</p>
        </div>

        {/* Releases */}
        <div className="space-y-20">
          {releases.map((release) => (
            <article key={release.version} className="relative">
              {/* Version header */}
              <div className="flex items-baseline gap-4 mb-8">
                <span className="text-2xl font-bold text-slate-900 tracking-tight">v{release.version}</span>
                <span className="text-sm text-slate-600 font-medium">{release.date}</span>
              </div>

              {/* Highlights */}
              {release.highlights && (
                <div className="mb-10 p-5 rounded-2xl bg-gradient-to-r from-indigo-50/80 to-violet-50/60 border border-indigo-100/60">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3">Highlights</p>
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
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-700 leading-relaxed">
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
        <p className="text-center text-xs text-slate-600">
          Course Mapper &mdash; Transform syllabi into structured course maps with AI.
        </p>
      </footer>
    </div>
  );
}
