import React from 'react';
import Header from '../components/Header';

const releases = [
  {
    version: '0.9.1',
    date: 'June 10, 2026',
    title: 'Classroom-Ready Program: Subject-Matter Enrichment',
    highlights: [
      'Compiled materials can now teach the subject, not just the course: a budgeted enrichment pass writes real quiz items, key terms with correct definitions, teaching-slide assertions, debatable discussion prompts, and concrete assignment tasks inside compiler-owned frames',
      'Every enriched item passes Haladyna-derived item-writing lint (complete stems, homogeneous distractor sets, no all-of-the-above), a meta-content check, and source-grounding rules before it is accepted — invalid items fall back to compiled frames individually',
      'A substance audit now measures how much of each assessment talks about the course process instead of the discipline (baseline: 56% of quiz surfaces, 100% of key terms) and feeds the post-generation digest',
      'Localization: the assistant can interview you for the dozen facts only you know (term, meeting pattern, contact, office hours, LMS) and compiled syllabi use them; a pre-export checklist lists every item that still needs your eyes',
      'Visual craft: three designed document themes, cover pages for multi-lesson documents, content-driven slide-deck length (11-14 slides instead of always 12), and an accessibility scan in export verification',
      'Quality governance: the Classroom-Ready Rubric (QM 7th Edition-style gates, Biggs alignment, UDL 3.0, Mayer) is now the standing judging instrument, with phase-exit scorecards in verification-output',
      'Seven residual v0.9 language bugs fixed, including the lesson-plan run-on template, semicolon-in-parentheses citation truncation, and concept-list duplicates',
    ],
    sections: [
      {
        label: 'Subject-Matter Enrichment',
        icon: 'AI',
        color: 'emerald',
        items: [
          'blueprintEnrichmentPass gained a per-lesson content stage: chunked calls (two lessons per request) produce quizItems, keyTerms, slideContent, discussionPrompt, and assignmentCore under strict JSON contracts with per-item validation and individual fallback.',
          'Compilers overlay enriched content onto their frames: quiz ids/points/rotation, deck shape/timing, brief milestones/policies all stay deterministic, and every enriched field carries enrichmentSource provenance.',
          "Grounding is enforced: enrichment may only use the course map's own readings; URLs and page citations not present in the source are rejected by lint.",
        ],
      },
      {
        label: 'Truth & Localization',
        icon: 'QA',
        color: 'amber',
        items: [
          'update_local_facts powers a conversational localization interview; saved facts flow into the compiled syllabus identity block and the semester label.',
          'The pre-export checklist combines missing localization facts with compiler-flagged local-review actions, confirmable per course; export stays allowed while the state stays honest.',
          'Meta-content/substance audit (auditSubstance) reports per-deliverable how many assessment surfaces are course-process talk, with samples.',
        ],
      },
      {
        label: 'Visual Craft & Governance',
        icon: 'UI',
        color: 'indigo',
        items: [
          'docTheme.js ships indigo/graphite/forest themes; multi-lesson DOCX exports open with a designed cover page.',
          'Slide decks vary 11-14 slides by content: extra enriched assertions become content slides; single-concept lessons drop the generic second content slide.',
          'auditOfficeAccessibility verifies heading structure, footers, table header shading, and image alt text on every export; CLASSROOM_READY_RUBRIC.md and per-phase scorecards govern release quality from now on.',
        ],
      },
    ],
  },
  {
    version: '0.9.0',
    date: 'June 9, 2026',
    title: 'The TA Who Built the Course',
    highlights: [
      'Ground-up agent redesign: the assistant now reads the actual course materials, quotes them, critiques them, and edits like an author — powerful on request, restrained by default',
      'New course content index renders every artifact to instructor-facing text with stable anchors; read_rendered, search_course, and explain_design replace metadata-only answers',
      'explain_design answers "why is this designed this way?" from the compiler\'s own stored grounding and decision records',
      'Author-grade replaceItem edits and multi-artifact changesets flow through reviewable before/after diffs; compiler trust records survive rewrites',
      "Post-generation digest surfaces at most three grounded observations (content-quality findings, flat Bloom's levels, unassessed objectives) as observe-only chips — nothing is ever auto-applied",
      'The chat knows which lesson card is on screen ("this question" needs no disambiguation), and a per-course decision journal carries decisions, rationale, and open threads across sessions',
      'Model routing is applied to real agent calls: critique and authorship turns escalate mini models to the high-reasoning sibling, recorded in receipts',
    ],
    sections: [
      {
        label: 'Course-Native Agent',
        icon: 'AI',
        color: 'emerald',
        items: [
          'courseContentIndex.js renders every deliverable item and course-map lesson to labeled plain text (the CSV-export flattening instructors actually receive) with lexical search and stable anchors.',
          'New tools: read_rendered (untruncated instructor-facing text), search_course ("where do we introduce X?"), explain_design (compiler grounding, repairs, genre, weight provenance), trace_objective (alignment chain with named gaps), log_decision (course journal).',
          "The system prompt now carries a TA persona with an explicit agency contract (observe always / propose by default / apply on consent), grounding rules that require quoting read content, the course's assessment arc, and an ON SCREEN NOW block fed by the new viewport tracking.",
          "read_deliverable's truncation flag now actually trims long fields and points to read_rendered for full text.",
        ],
      },
      {
        label: 'Authorship',
        icon: 'UI',
        color: 'indigo',
        items: [
          'replaceItem action rewrites a whole item (or one question/slide/criterion) while preserving internal compiler records; preValidateAction enforces a full replacement payload.',
          'Proposal options can carry actions[] changesets — coordinated edits across deliverables that apply together on accept, with per-action previews in the diff review card.',
          "A voice_style memory category captures the instructor's writing voice whenever they rewrite agent text; rewrite rules tell the agent to match it.",
        ],
      },
      {
        label: 'Proactive, Not Leading',
        icon: 'QA',
        color: 'amber',
        items: [
          'agentDigest.js builds at most three post-generation observations from deterministic signals; DigestCard renders them as quiet chips whose buttons only start conversations — the non-leading contract is structural and unit-tested.',
          'courseJournal.js keeps a per-course record of design decisions, rationale, and open threads, surfaced in the dynamic prompt so every conversation starts knowing the story so far.',
          'Per-turn model routing (getAgentTurnModel) escalates OpenAI mini models to gpt-5.5 for critique/authorship turns and records routedModel and escalation reason in run receipts.',
        ],
      },
    ],
  },
  {
    version: '0.8.61',
    date: 'June 9, 2026',
    title: 'Output Quality Release',
    highlights: [
      'A full audit of a real four-course v0.8.6 export drove this release: compiled deliverables now read like courseware instead of a mail merge',
      'Concept extraction emits multi-word phrases ("Climate Science"), never bare title fragments ("Science", "Frameworks") stuffed into quiz stems, tags, and key terms',
      'A new language finalizer shortens repeated assessment and lesson titles to week-anchored references after their first mentions, and repairs template seams (article agreement, double periods, dangling clauses, leading-colon labels)',
      'Quiz banks rotate distractor families and explanation phrasing so the correct option is no longer the stylistic odd one out, and success criteria vary their stems per lesson',
      'Student-facing briefs, study guides, and anchor guidance now speak to the student; instructor moves stay in lesson plans and rubric facilitation notes',
      'DOCX exports gained real heading structure, footers with page numbers, and tables for the syllabus alignment matrix, grading scale, and important dates; slide decks no longer show "SUGGESTED VISUAL" placeholder boxes on student-facing slides',
      'Export verification now runs deterministic content-quality checks (dangling clauses, instructor voice, uniform answer keys, rendered-text phrase repetition) and reports them as warnings instead of claiming "ready, 0 warnings"',
    ],
    sections: [
      {
        label: 'Compiler Language',
        icon: 'AI',
        color: 'emerald',
        items: [
          'wordsFromConcepts splits source text on punctuation and conjunctions into phrase candidates; stripListPrefix understands "1.1:"-style section numbering so key terms never start with a colon.',
          'compiledLanguageFinalizer.js runs after every compile: per-document budgets keep the first two full-title mentions and convert the rest to references like "the Week 2 check" or the topic\'s first phrase unit, with article-aware joins.',
          'conciseClause completes at clause boundaries and trims dangling connectives; truncated self-assessment sentences and the empty Grading Criteria section are gone.',
          'Generative AI Policy and Academic Integrity now carry distinct syllabus text, and grading rows state shared success criteria once instead of stamping them per row.',
          'Sparse course-map repair filler rotates sentence stems by section so repaired maps stop seeding identical text into every deliverable.',
        ],
      },
      {
        label: 'Document Formatting',
        icon: 'UI',
        color: 'indigo',
        items: [
          'Every DOCX gets a Title-styled heading, Heading 2/3 section structure for the Word navigation pane and screen readers, and a footer with the course name plus page X of Y.',
          'The syllabus outcome alignment matrix, grading scale, and important dates render as real tables instead of pipe-delimited text lines.',
          'Slide decks keep visual suggestions in speaker notes with alt text; student-visible surfaces carry no authoring scaffolding, and quiz exports collapse repeated "Aligns to" lines.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: 'QA',
        color: 'amber',
        items: [
          'contentQualityChecks.js audits compiled deliverables for sentence integrity, instructor voice in student surfaces, and uniform quiz answer keys; findings surface as export warnings.',
          'exportRenderedTextAudit.js measures phrase repetition on the rendered DOCX/PPTX text per lesson section, matching what instructors actually read.',
          'The classroom-readiness boilerplate gate names the repeated sentence in its warning and treats week-anchored references as deliberate per-lesson specificity.',
          'scripts/v0861OutputQualityRepro.mjs replays the audited sparse Climate Justice course shape end-to-end and fails on any recurrence of the audited defect classes.',
        ],
      },
    ],
  },
  {
    version: '0.8.6',
    date: 'June 9, 2026',
    title: 'Compiler Efficiency and Trust Surface Release',
    highlights: [
      'Anthropic generation calls now mark the shared system prompt as a prompt-cache prefix, so chunked course-map generation and retries stop re-paying for identical instructions',
      'The conditional course-map review now focuses the model on only the lessons deterministic checks flagged, instead of resending the whole course map',
      'New lean course-map mode (flag-gated): the model emits compact atoms and the compiler renders the instructor-facing cell prose deterministically',
      'The gold audit gained a calibrated copy-variety gate that fails any compiler change that measurably increases templated near-duplicate language',
      'A package trust strip in the workspace header now shows compiled vs custom counts, safe auto-fixes, stale, and failed deliverables at a glance',
      'The dormant development proxy moved out of the repo root into archive/, so the deployable surface contains no server code',
    ],
    sections: [
      {
        label: 'Token Efficiency',
        icon: 'API',
        color: 'emerald',
        items: [
          'Anthropic provider requests built by `buildProviderTextRequest` wrap the system prompt in a cache_control block whenever the model profile supports prompt caching, with a generation-plan opt-out.',
          'The examine pass builds a focused payload when problems are local: only flagged lessons are sent, each carrying its original lessonIndex, with add/remove-lesson patches rejected in focused mode.',
          'Lean course-map atoms (`generationPlan.leanCourseMapAtoms`) replace verbose per-cell prose rules with compact array contracts; `expandLeanCourseMap` renders stems, numbering, and labels idempotently before validation.',
        ],
      },
      {
        label: 'Quality Gates',
        icon: 'QA',
        color: 'indigo',
        items: [
          'buildCopySpecificityAudit now detects near-duplicate template families (Jaccard similarity within a structural path family) alongside the existing exact-repeat blocker.',
          'The variety gate is calibrated against all 40 gold samples (worst current sample: 48 families) with a 60-family regression budget per sample.',
          'New focused unit suites cover prompt caching, focused examine scans, lean expansion, and the variety metric.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: 'UI',
        color: 'amber',
        items: [
          'PackageTrustStrip chips summarize deterministically compiled vs custom deliverables, safe repairs from the last finish run, stale items, and failures without opening receipts.',
          'Deployment security tests now assert the repo root contains no server entry point.',
        ],
      },
    ],
  },
  {
    version: '0.8.59',
    date: 'June 8, 2026',
    title: 'Real-Browser Agent Quality Harness Release',
    highlights: [
      'Added a first-class Playwright/Chromium agent quality harness that drives the real side panel through 25 closed-loop scenarios',
      'Added response-quality scoring for missing required terms, unnecessary questions, false success, raw tool traces, read-only mutations, and confirmation behavior',
      'Expanded agent scenario coverage across missing deliverable refusals, safe targeted edits, broad destructive confirmation, ambiguous targets, read-only summaries, finish-package runs, and download readiness',
      'Hardened side-panel behavior so simple read-only count/list questions stay local and do not quietly run package finalization',
      'Fixed batched deliverable edits so multiple slide-note or artifact-local updates in one tool call persist together instead of overwriting earlier edits',
      'Final v0.8.59 proof passed 25/25 real browser agent scenarios with a 100/100 response-quality average',
    ],
    sections: [
      {
        label: 'Browser Harness',
        icon: 'QA',
        color: 'indigo',
        items: [
          'Added `quality:agent:browser:smoke` and `quality:agent:browser:full`, backed by `scripts/realBrowserAgentQualityLoop.mjs`.',
          'The harness starts the local app, seeds a restored workspace, drives the Agent side panel in Chromium, snapshots workspace state after every task, and writes reproducible artifacts under `verification-output/agent-real-browser`.',
          'The checked-in scenario catalog currently covers 25 high-value real agent tasks, including no-ghost deliverables, safe direct edits, read-only checks, package finishing, destructive confirmation, and ambiguity handling.',
        ],
      },
      {
        label: 'Response Quality',
        icon: 'AI',
        color: 'emerald',
        items: [
          'Added response-quality scoring that fails runs for raw tool traces, false success after failed mutations, unnecessary questions, read-only state changes, and missing required instructor-facing terms.',
          'Simple quiz-count and lesson-title questions now answer from local workspace state before the model can over-route into package finalization.',
          'Broad destructive requests now get a compact confirmation request before the agent rewrites, replaces, regenerates, or overwrites broad workspace content.',
        ],
      },
      {
        label: 'Side Panel Reliability',
        icon: 'UX',
        color: 'amber',
        items: [
          'Batched deliverable edits now keep a working deliverables copy and refresh the UI executor ref after each optimistic update, preventing later actions from overwriting earlier edits in the same tool call.',
          'Artifact-local slide title, speaker-note, visual, timer, quiz-question, FAQ, and lesson-plan outline edits route directly while course-design edits still sync through the blueprint path when needed.',
          'The final proof report is `verification-output/agent-real-browser/2026-06-08T00-27-21-843Z/report.md`: 25 passed, 0 failed, 100/100 average response quality, 0 console errors, and 0 failed browser requests.',
        ],
      },
    ],
  },
  {
    version: '0.8.58',
    date: 'June 6, 2026',
    title: 'Red-Team Quality Hardening Release',
    highlights: [
      'Added a 260-scenario v0.8.58 red-team inventory across agent loops, export torture, recovery, generated quality, and live provider drift',
      'Added a dedicated v0.8.58 agent safety gate for no-ghost deliverables, lesson-specific readback, prompt rules, and compact side-panel language',
      'The v0.8.58 export torture sweep passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected',
      'Export finishing now persists safe course-map repairs before validation, fixing restored projects blocked by objective-stem cleanup',
      'Final v0.8.58 proof passed 2,177 unit tests, 122 browser E2E tests, 23 live OpenAI scenarios, and the 40-sample gold audit',
      'Release proof now writes repeatable reports under verification-output/v0.8.58-red-team and verification-output/v0.8.58-export-torture',
    ],
    sections: [
      {
        label: 'Red-Team Coverage',
        icon: 'RT',
        color: 'red',
        items: [
          'Added `tests/lib/v0858RedTeamScenarios.js` with 50 agent closed-loop scenarios, 60 export torture scenarios, 30 recovery scenarios, 80 generated-quality scenarios, and 40 live-provider drift scenarios.',
          'Added `audit:v0858:red-team`, which validates scenario minimums, duplicate IDs, required agent categories, recovery states, and export lesson-scope coverage.',
          'The generated red-team report records exact release commands so future hardening rounds can expand coverage without losing the existing baseline.',
        ],
      },
      {
        label: 'Agent Safety',
        icon: 'AI',
        color: 'indigo',
        items: [
          'Added `test:v0858:agent` to assert missing deliverables stay refused instead of creating ghost rubrics, assignments, or custom artifacts.',
          'The gate checks that lesson-specific deliverable judgments require `read_deliverable` with the target lesson before the agent claims quality, alignment, or readiness.',
          'Compact side-panel checks now preserve no-key local command state while avoiding old review-mode labels such as Package needs review, Needs your decision, and Review only.',
        ],
      },
      {
        label: 'Export Proof',
        icon: 'ZIP',
        color: 'emerald',
        items: [
          'Added `audit:v0858:sweep`, a 34-course export torture sweep labeled for v0.8.58.',
          'The sweep compiled every course through the blueprint/compiler path, finalized every package, built ZIP exports, and audited Office files for placeholders, internal text, slide density, speaker notes, FAQ depth, folders, and DOCX structure.',
          'Restored or generated course maps now write deterministic readiness repairs back into workspace state before export, so safe objective-stem cleanup cannot stay as a stale blocker.',
          'The v0.8.58 run passed 34/34 courses across 8-14 lesson packages with 0 blockers, 0 warnings, and 2,531 exported files inspected.',
          'Full release verification also passed lint, production build, bundle budget, 2,177 unit tests, 122 browser E2E tests, the 40-sample gold audit, hybrid pipeline audit, and 23 live OpenAI agent scenarios.',
        ],
      },
    ],
  },
  {
    version: '0.8.57',
    date: 'June 6, 2026',
    title: 'Compact Agent Side Panel Release',
    highlights: [
      'The Agent side panel now shows less by default while keeping receipts and recovery details one click away',
      'Finish, check, and local no-key workflows use clearer bundled wording instead of exposing internal modes',
      'Missing deliverables now produce specific generate-first refusals instead of vague completion messages',
      'The v0.8.57 release proof passed 34/34 courses, 122/122 browser E2E tests, 23/23 live OpenAI scenarios, and the 40-sample gold audit',
    ],
    sections: [
      {
        label: 'Side Panel UX',
        icon: 'UX',
        color: 'indigo',
        items: [
          'Workspace status, package summaries, progress cards, and receipts now keep secondary tool counts, skipped actions, and trace details collapsed behind Details.',
          'Agent labels were simplified from audit/review mode language into instructor-facing outcomes such as Check package, Finish package, Ready to download, and Review before export.',
          'Recoverable package details stay quiet until they matter, reducing side-panel noise while preserving full audit evidence when expanded.',
        ],
      },
      {
        label: 'Consider It Done',
        icon: 'AI',
        color: 'emerald',
        items: [
          'The system prompt now makes the Planner -> Executor -> Verifier loop explicit for serious requests and tells the agent to bundle safe finish/check workflows automatically.',
          'Alignment questions now route to compare_deliverables or evidence reads instead of answering from memory alone.',
          'Generic model responses such as “Agent completed” are replaced with concrete failed-tool explanations when a missing deliverable or blocked mutation is the real result.',
        ],
      },
      {
        label: 'Release Proof',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v0857:sweep`, a repeatable 34-course release proof for v0.8.57.',
          'The v0.8.57 smoke sweep passed 5/5 courses and the full sweep passed 34/34 courses across the curated real-course scenarios.',
          'Local gates passed lint, production build, 2,169 unit tests, 122 browser E2E tests, the 132-case blueprint matrix, pipeline audit, bundle budget, 40-sample gold audit, and 23 live OpenAI agent scenarios.',
        ],
      },
    ],
  },
  {
    version: '0.8.56',
    date: 'June 6, 2026',
    title: 'Live Agent and Slide Quality Release',
    highlights: [
      'Live OpenAI proof now covers 23 scenarios, including state-changing closed-loop edits with read-back verification',
      'Course-health and review requests now route through validation/finalization before the agent responds',
      'PPTX ZIP audits now fail over-dense visible slide text, keeping generated decks presentation-scale',
      'The 34-course sweep passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected',
    ],
    sections: [
      {
        label: 'Live OpenAI Loop',
        icon: '23',
        color: 'emerald',
        items: [
          'The live OpenAI suite now passes 23/23 scenarios, including stateful lesson renames, existing quiz rewrites, and missing-rubric refusal.',
          'Closed-loop tests execute the selected action, verify the mutated course state, and assert the final receipt does not leak API-key material.',
          'Audit and course-health prompts now explicitly require validation or finalization before the agent gives a readiness answer.',
        ],
      },
      {
        label: 'Slide Quality Gate',
        icon: 'PPT',
        color: 'indigo',
        items: [
          'Compiled slide decks now keep on-slide bullets compact while preserving detailed activity sequences in speaker notes.',
          'Visual placeholders now render compact instructor-facing descriptions instead of long internal visual guidance.',
          'ZIP export audits block visible PPTX slides over the density limit, reducing max visible slide words from 267 to 82 and p95 from 211 to 74 across 3,624 slides.',
        ],
      },
      {
        label: 'Release Proof',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v0856:sweep`, a repeatable 34-course release proof for v0.8.56.',
          'The v0.8.56 sweep passed 34/34 courses across 8-14 lesson scopes with 0 blockers and 0 warnings.',
          'The sweep inspected 2,531 exported DOCX, XLSX, CSV, PPTX, and ZIP files for placeholder text, public-output leakage, slide density, notes depth, FAQ coverage, folder structure, and DOCX list structure.',
        ],
      },
    ],
  },
  {
    version: '0.8.55',
    date: 'June 6, 2026',
    title: 'Expanded Quality Round Release',
    highlights: [
      'The release gate now includes every unique curated full-course ZIP package, not only the 25-course subset',
      'The expanded sweep passed 34/34 courses with zero blockers and zero warnings while inspecting 2,531 exported files',
      'The full blueprint/compiler matrix passed 132 restored, sparse, custom, and real-course scenarios',
      'Browser E2E passed 122 workspace, export, recovery, landing, mobile, and accessibility tests',
    ],
    sections: [
      {
        label: 'Expanded ZIP Proof',
        icon: '34',
        color: 'emerald',
        items: [
          'Added `audit:v0855:sweep`, a repeatable 34-unique-course proof gate for the full curated course set.',
          'The sweep compiles blueprints, finalizes packages, builds ZIPs, and audits actual Office exports for placeholders, internal language, speaker-note depth, FAQ coverage, folder structure, and DOCX list structure.',
          'The current report passed 34/34 courses with 0 blockers, 0 warnings, and 2,531 exported files inspected.',
        ],
      },
      {
        label: 'Scenario Matrix',
        icon: '132',
        color: 'indigo',
        items: [
          'The full blueprint-quality matrix now remains part of the release evidence, covering 132 compact-storage, restored-blueprint, sparse-source, custom-deliverable, and export-verification cases.',
          'The 40-sample gold audit passed with 0 blockers and 0 warnings, including short, standard, semester-length, counseling, sparse-assessment, and messy-clinical resilience samples.',
          'The 122-test browser E2E suite passed restored invalid-key recovery, provider switching, no-key local commands, export blocking, auto-repair, mobile layout, and landing-page behavior.',
        ],
      },
      {
        label: 'Release Operability',
        icon: 'QA',
        color: 'amber',
        items: [
          'The quality-sweep script now accepts a release label so v0.8.55 proof reports identify the exact release being tested.',
          'The stale private OpenAI key was caught during live-provider testing; the product-level invalid-key recovery path is covered by browser E2E and remained green.',
          'v0.8.55 is a quality-proof release rather than a feature expansion: it promotes the larger retest loop into a repeatable command.',
        ],
      },
    ],
  },
  {
    version: '0.8.5',
    date: 'June 6, 2026',
    title: 'Export Quality Sweep Release',
    highlights: [
      'Export readiness now stays aligned with the final package state, so fixed issues do not keep blocking ZIP downloads',
      'Public DOCX, XLSX, CSV, PPTX, and ZIP outputs are sanitized to keep internal proof and review language out of instructor-facing files',
      'The compiler produces more lesson-specific concepts, slide guidance, quiz rationales, rubric language, and assignment labels with less repeated boilerplate',
      'A new 25-course quality sweep compiles, finalizes, exports, and inspects 1,800+ generated files across broad disciplines and lesson scopes',
    ],
    sections: [
      {
        label: 'Export Reliability',
        icon: 'ZIP',
        color: 'emerald',
        items: [
          'The export panel now refreshes package readiness after the finalizer applies safe repairs, preventing stale "needs attention" blockers from surviving a completed finish pass.',
          'ZIP verification reads the actual generated output and blocks only real export problems, not title-only readability noise or already repaired warnings.',
          'Restored projects with dirty course-map state are repaired before export even when the instructor selected only downstream deliverables.',
          'Course-map, syllabus, lesson plan, slide deck, rubric, quiz, assignment, discussion, study guide, and FAQ exports are covered by focused regression checks.',
        ],
      },
      {
        label: 'Public Output Cleanup',
        icon: 'TXT',
        color: 'slate',
        items: [
          'Internal terms such as local review, source-review-required, source grounding, and publish gate are scrubbed from public export surfaces.',
          'Slide deck DOCX exports omit internal sequence-guide metadata while keeping useful instructor-facing notes.',
          'Quiz exports keep answer and rationale value while removing repetitive distractor-rationale boilerplate from public documents.',
        ],
      },
      {
        label: 'Generated Quality',
        icon: '25',
        color: 'indigo',
        items: [
          'Concept selection now prefers lesson-title signals before broad course atoms, improving subject specificity in downstream materials.',
          'Assessment and activity language is shorter and more readable, reducing false readiness warnings for introductory courses.',
          'Repeated-boilerplate detection now ignores expected policy and format fields while still catching true repeated instructional copy.',
        ],
      },
      {
        label: 'Quality Sweep Gate',
        icon: 'QA',
        color: 'amber',
        items: [
          'Added `audit:v085:sweep`, a repeatable 25-course proof gate that compiles blueprints, finalizes packages, builds ZIPs, and audits Office output.',
          'The latest sweep passed 25/25 courses with zero blockers and zero warnings across 8-14 lesson packages and 22 course modalities.',
          'A fresh 25-course retest now covers restored messy course maps, stale export-only repairs, and repeated counseling checklist copy.',
          'The sweep inspected 1,828 exported files for placeholders, internal text leakage, required assets, speaker notes, FAQ counts, folder structure, and DOCX bullet structure.',
        ],
      },
    ],
  },
  {
    version: '0.8.4',
    date: 'June 5, 2026',
    title: 'Compiler Weight Shift Release',
    highlights: [
      'Blueprints now have a lean semantic contract while compiler-owned proof surfaces are derived deterministically before compilation',
      'Common per-lesson custom deliverables such as feedback forms, lab reports, case briefs, policy memo checkpoints, and problem-set worksheets compile without model fallback',
      'Compiled receipts now include proof-bundle verification from reading the derived state back, not only trusting tool success',
      'The compiler scenario gate now covers different prompt styles, restored/lean blueprint state, lesson scopes, and larger 14-lesson packages',
    ],
    sections: [
      {
        label: 'Lean Blueprint Contract',
        icon: '✓',
        color: 'emerald',
        items: [
          'Compilation now gates on source-grounded semantic atoms: lessons, outcomes, concepts, artifacts, success criteria, source traces, source-use policy, evidence plans, compiler decisions, and assessment anchors.',
          'The older strict blueprint contract remains available as a compatibility audit, but missing receipt/report surfaces no longer block a semantically valid restored blueprint from compiling.',
          'Old or lean project state can be prepared for compilation by rebuilding missing compiler-owned maps before deliverables are generated.',
        ],
      },
      {
        label: 'Compiler Proof Bundle',
        icon: '▣',
        color: 'slate',
        items: [
          'The compiler now derives handoff, dry-run, classroom evidence loop, feedback-load, assumption ledger, coherence, review-surface, workload, and assessment proof surfaces before compiling.',
          'Syllabus and lesson-plan receipts read those proof surfaces from the compiler bundle, including verification status, row counts, skipped model fallback, and traceability findings.',
          'A new compiler-output contract checks final user value: selected features exist, lesson coverage is complete, proof bundle passed, and receipts carry read-back verification.',
        ],
      },
      {
        label: 'Custom Families',
        icon: '+',
        color: 'indigo',
        items: [
          'Feedback forms, project milestone checklists, lab reports, case briefs, policy memo checkpoints, observation checklists, participation/self-assessments, capstone progress reports, and problem-set worksheets now compile deterministically when the custom definition asks for one item per lesson or week.',
          'Unknown, broad, whole-course, portfolio, or fully custom structures still stay on the model path instead of being forced into an unsafe deterministic template.',
          'Compiler receipts keep the model fallback boundary explicit for these custom families.',
        ],
      },
      {
        label: 'Scenario Coverage',
        icon: '10',
        color: 'amber',
        items: [
          'The compiler suite now includes a restored lean-blueprint scenario that strips proof/report fields, derives them back, compiles syllabus, lesson plans, assignments, and rubrics, then validates output receipts.',
          'A 10-scenario prompt-style gate covers policy studio, biology lab, programming lab, data science, engineering design, online writing, quantitative problem sets, capstone projects, counseling practice, scoped lesson subsets, and a 14-lesson package.',
          'Focused compiler coverage now asserts intent, safety, state change, verification, coverage, and final user value instead of only one expected tool path.',
        ],
      },
    ],
  },
  {
    version: '0.8.3',
    date: 'June 5, 2026',
    title: 'Workspace Recovery and Agent Trust Release',
    highlights: [
      'Old or half-finished projects can recover bad keys, no-credit keys, and model mismatches directly inside the workspace',
      'The agent path is conversation-first: safe targeted work happens from natural requests, while broad, destructive, missing, or ambiguous work asks first',
      'Agent receipts now show compact instructor-readable change details, affected work, skipped or failed actions, and read-back verification',
      'Closed-loop scenario coverage expands beyond first-tool-choice checks with v0.8.3 recovery, failure, stale-state, missing-deliverable, and package-finish cases',
    ],
    sections: [
      {
        label: 'Workspace Model Recovery',
        icon: '⚙',
        color: 'indigo',
        items: [
          'The Agent header model label opens provider, key, and model settings without returning to the landing page.',
          'Expired, invalid, validating, and no-credit key states now show an in-place recovery banner while keeping the loaded project visible.',
          'No-key local commands remain available for safe reads, package audits, planning, undo, and configuration instead of dead-ending the conversation.',
        ],
      },
      {
        label: 'Conversation-First Agent',
        icon: '✓',
        color: 'emerald',
        items: [
          'The user no longer chooses between review/edit modes in the main workspace; the agent applies safe targeted work and asks only when policy requires it.',
          'Plan vocabulary now uses inspect-first and safe-edit semantics, while older saved plan values still render with the same safe labels.',
          'Missing deliverables continue to block before mutation, so the agent refuses ghost rubrics, assignments, slides, study guides, FAQs, quizzes, and custom artifacts.',
        ],
      },
      {
        label: 'Readable Receipts',
        icon: '🧾',
        color: 'slate',
        items: [
          'Receipt sections now read as Change details, Work done, Plan, and Verified by reading back instead of tool-log language.',
          'State-diff receipts include before/after rows plus skipped and failed action reasons in the compact card.',
          'The v0.8.3 agent scorecard remains product-facing: intent, safety, verification, response value, and recovery are tracked as release metrics.',
        ],
      },
      {
        label: 'Finish Package Path',
        icon: '✦',
        color: 'amber',
        items: [
          'Finish package now explicitly plans when state is unclear, finalizes, repairs safe issues, retries localized weak spots, verifies exports/readiness, and reports remaining instructor decisions.',
          'Natural requests such as “finish my package,” “do the final pass,” “make this ready for class,” and “prepare export” route to the same finishing path.',
          'Finish receipts now list changed, skipped, failed, verified, and remaining decision items so the handoff is inspectable.',
        ],
      },
      {
        label: 'Scenario and CI Expansion',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Added 64 v0.8.3 receipt-level closed-loop scenarios covering restored-project recovery, missing deliverables, ambiguity, stale edits, provider failures, package finishing, repairs, and partial/skipped work.',
          'Normal pull-request CI is split into a faster format/lint/unit/build/bundle lane, while deep audits, E2E, and Firebase rules stay on push/manual proof gates.',
          'Footer release labels now consistently show v0.8.3 across Landing, Feature Select, Configure, and Workspace.',
          'Release docs now point v0.8.3 toward the stricter internal loop rather than an external-audit dependency.',
        ],
      },
    ],
  },
  {
    version: '0.8.2',
    date: 'June 4, 2026',
    title: 'Internal Self-Improvement Release',
    highlights: [
      'External expert audit is no longer a release dependency; v0.8.2 is gated by stricter internal self-audits, gold fixtures, export checks, and live smoke testing',
      'CourseMapper now states the release claim honestly: internally self-audited and regression-tested for controlled pilots, not externally expert-certified',
      'Security, first-run UX, audit operability, and package trust receipts were tightened around the existing deterministic compiler baseline',
      'The live OpenAI agent gate now covers 20 real-life instructor scenarios, including research, grammar checks, diagrams, charts, custom macros, undo, and missing-deliverable safety',
    ],
    sections: [
      {
        label: 'Self-Improvement Loop',
        icon: '✦',
        color: 'indigo',
        items: [
          'Added audit:self, a deterministic internal self-improvement gate that compiles adversarial course fixtures without external reviewer files.',
          'The self-audit now reports blockers, warnings, improvement candidates, accepted input risks, timing/workload plausibility findings, and compact per-fixture receipts.',
          'Adversarial fixtures cover sparse official dates and assessments plus contradictory clinical schedules, forcing review-boundary signals instead of silently smoothing over source risk.',
          'audit:expert remains available as an internal provisional harness, while external proof packets and strict external gates are optional evidence-collection tools for later certification.',
        ],
      },
      {
        label: 'Security and Privacy',
        icon: '🛡️',
        color: 'emerald',
        items: [
          'Firebase Hosting now carries a CSP and security-header baseline for controlled static BYOK pilots.',
          'KaTeX-rendered HTML is sanitized before insertion or image rendering, while allowed math still renders.',
          'Chat persistence now redacts API-key-like text inside user and assistant messages, titles, previews, and legacy conversation loads.',
          'The dormant Express proxy now fails closed in production unless explicitly enabled as a development-only proxy.',
          'Production dependency audit is clean; the remaining full-audit advisory is documented as a dev-only Firebase CLI exception.',
        ],
      },
      {
        label: 'First-Run UX',
        icon: '⚡',
        color: 'amber',
        items: [
          'Feature selection and configuration screens now keep the primary CTA visible with sticky action bars at common desktop viewport sizes.',
          'The configure preview now derives its title and lesson count from the user prompt and selected scope instead of showing a misleading static sample.',
          'Institution profile and model-tuning details now live behind one Advanced course and model settings section so first-run users see fewer decisions before Generate.',
          'Landing-screen helper text, inactive model fields, and footer links have stronger contrast in the default no-key state.',
          'Footer release labels now consistently show v0.8.2 across Landing, Feature Select, Configure, and Workspace.',
        ],
      },
      {
        label: 'Agent Verification',
        icon: '✓',
        color: 'emerald',
        items: [
          'audit:agent:openai now runs 20 live real-life scenarios with the private OpenAI API-file workflow used for local release verification.',
          'The second scenario set covers academic research, grammar checks, concept maps, quiz-count charts, lesson reads, quiz cognitive-level review, slide-deck visual improvement, reusable custom macros, undo, and missing-assignment refusal.',
          'Restored workspaces with a missing, expired, or invalid key now recover in place from the Agent header model/config control instead of sending users back to the landing page.',
          'Deliverable edits now fail before mutation when the target deliverable, generated lesson slot, or required item path does not exist, preventing ghost rubrics, assignments, and lesson artifacts.',
          'A new closed-loop safety suite covers 30 state-mutation and no-mutation cases across course-map edits, quizzes, rubrics, assignments, slides, study guides, regeneration, and missing-deliverable refusal.',
          'Restored-project browser coverage now exercises invalid-key recovery, valid-key reconnection, provider switching, model persistence, and workspace-dismissal behavior.',
          'No-key users can now type natural local command requests such as "can you audit this package?" and still reach the read-only package audit path without provider calls.',
          'Package action labels now stay action-focused instead of exposing internal execution modes.',
        ],
      },
      {
        label: 'Audit Operability',
        icon: '⚙',
        color: 'slate',
        items: [
          'audit:gold now emits progress lines with sample number, scope, status, blockers, warnings, and elapsed time.',
          'audit:gold supports --sample and --modality scoped runs for fast development checks while keeping the full matrix as the release gate.',
          'Deployment docs include the private API-file live smoke pattern used for bounded provider verification without committing keys.',
          'Dependency docs split patch/minor maintenance from React 19, Tailwind 4, and pdfjs-dist 6 major migration tracks, with bundle:check as the chunk-budget gate.',
        ],
      },
      {
        label: 'Trust Surface',
        icon: '🧾',
        color: 'slate',
        items: [
          'Package handoff now includes a compact receipt for compiled deliverables, model-generated deliverables, repairs, review-needed lessons, export verification, local confirmations, and budget status.',
          'Agent audit responses surface the same compact receipt after local package audits.',
          'Review-required rows now show concrete actions for official dates, local policy, source permissions, and surfaced package findings before users treat a draft as publishable.',
        ],
      },
    ],
  },
  {
    version: '0.8.1',
    date: 'June 1, 2026',
    title: 'A-Quality Blueprint Compiler Proof Readiness',
    highlights: [
      'The course blueprint is now a richer instructional representation with source confidence, teaching moves, review boundaries, and compiler decisions',
      'Gold-sample and expert-review audits now check whether compiler output is classroom-ready, source-faithful, and transparent about what still needs human review',
      'Compact enrichment and instructor preference learning are wired into the compiler path without returning to high-cost generation for the core package',
      'Internal proof is strong, but external A-quality certification still requires completed real reviewer fixtures before we call it proven',
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
          'Blueprints now include a per-lesson classroom dry-run plan, so instructors can rehearse the first ten minutes, evidence checkpoint, likely failure mode, and adjustment move before publishing.',
          'Blueprints now include a classroom implementation evidence loop, so lesson plans preserve what evidence to collect after teaching, which adjustment to make, and which instructor edits should become future preference signals.',
          'Blueprints now include an instructor feedback-load plan, so packages expose grading time, batching strategy, calibration cues, and next-instruction signals before handoff.',
          'Weak-input lessons now carry a concrete local-review action through syllabus rows, lesson plans, slide decks, assignments, and each compiled lesson grounding before the package can claim classroom readiness.',
          'Blueprints now include an objective-level evidence map, so every lesson objective must show practice, assessment, rubric, quiz/check, feedback, and revision evidence before compilation is treated as classroom-ready.',
          'Syllabus trust receipts and course-at-a-glance rows now use compact proof summaries instead of copying full internal blueprint maps into user-facing materials.',
          'Generic custom CSV and DOCX exports now omit internal compiler proof metadata while keeping the visible custom deliverable content intact.',
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
          'External proof packets now generate a reviewer completion checklist in Markdown and JSON, and the recommended strict-proof bundle embeds the same checklist so private reviewer bundles remain self-contained.',
          'Reviewer checklists now include an explicit real-course project row when external project.courseMap proof is missing, making the remaining certification blocker harder to miss.',
          'Full-package reviewer files now include a Local Review Actions matrix so experts can verify publish-before-use checks without digging through giant artifact JSON.',
          'Recommended strict-proof bundles now cover 5-, 8-, and 14-lesson scopes across different modalities and show whether the required real external course map is at a valid proof scope.',
          'The strict external gate now blocks real-course proof that is complete but off-scope, so curated samples cannot hide an unproven real-course workflow.',
          'External source-fidelity proof now requires visible local-review actions for every core artifact, so expert reviewers verify that weak or inferred areas tell instructors exactly what to confirm before publishing.',
          'External reviewer fixtures must now match the current package version, preventing stale review packets from certifying a newer compiler build.',
          'Expert proof reports now show current-version fixture coverage and stale fixture IDs as a dedicated readiness item.',
          'Gold audits now include a Copy Specificity Matrix that blocks repeated long surface copy across classroom-facing deliverables.',
          'Gold audits now include an Objective Evidence Matrix that checks objective-by-objective evidence propagation across the compiled core package.',
          'Gold audits now include a Workload Balance Matrix that verifies weekly student workload stays realistic and remains visible in syllabus, assignment, and lesson-plan outputs.',
          'Gold audits now include a Classroom Dry-Run Matrix and block packages that hide per-lesson rehearsal checks or instructor adjustment plans.',
          'Gold audits now include a Classroom Evidence Loop Matrix and block packages that cannot explain how classroom evidence should improve the next run.',
          'Gold audits now include an Instructor Feedback Load Matrix and block packages that hide grading effort, batching, calibration, or next-instruction cues.',
          'Gold audits now include a Review Actionability Matrix that blocks weak-input packages when instructors cannot see exactly what to confirm before publishing.',
          'Gold audits now include a Student-Facing Cleanliness Matrix that blocks internal compiler, proof, and publish-gate language from leaking into classroom-facing prompts and handouts.',
          'External source-fidelity notes must now cite the local-review or publish-before-use action reviewers saw, blocking generic trust notes.',
          'Package export verification now fails before download if exported CSV text still exposes internal compiler or proof language.',
          'Export verification now opens generated DOCX and PPTX files and blocks downloads when document, slide, or speaker-note text leaks internal compiler/proof language.',
          'Course-map XLSX verification now opens generated workbook XML and blocks downloads when worksheet or shared-string text leaks internal compiler/proof language.',
          'ZIP packaging now fails closed if the actual generated DOCX, PPTX, or XLSX file would leak internal proof language, and live ZIP audits check the same issue.',
          'Current-tab exports and Google uploads now use the same proof-language guard before CSV, DOCX, PPTX, Sheets, Docs, or Slides files leave the app.',
          'PDF exports now scan the rendered course-map, syllabus, deliverable, slide-deck, and all-export text before creating a file.',
          'Export readiness now includes PDF text checks before the app or agent can call selected materials export-ready.',
          '.coursemapper backups, autosave snapshots, cloud snapshots, and developer snapshots now strip API-key/token fields and redact key-like text while keeping provider/model choices.',
          'Direct cloud project, deliverable, agent-memory, and custom-tool saves now reuse the same sanitizer so future persistence paths cannot bypass the trust boundary.',
          'Cloud restore and merge reads now sanitize legacy records before they re-enter app state, while preserving timestamp metadata needed by project lists.',
          'Local autosave restore, .coursemapper import, cloud project open, and Developer Mode snapshot apply now sanitize legacy project objects before workspace state is restored.',
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
          'Blueprint receipts now include an adaptive repair plan with deterministic repair counts, review-required source-gap rows, model-fallback limits, and escalation rules.',
          'Compiled syllabus, assignment, and rubric grading-weight receipts now use compact provenance rows instead of repeating internal policy text on every deliverable row.',
          'Rubric calibration notes, quiz distractors, quiz explanations, and course-at-a-glance focus rows now vary by criterion, question, or lesson instead of repeating generic compiler copy.',
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
          'No-workspace-edit safety now blocks targeted retry alongside other editing tools while keeping read-only export verification available.',
          'Regression tests cover the finalizer, export verifier, package card, auto-review prompt, no-workspace-edit filtering, and model-routing advice.',
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
