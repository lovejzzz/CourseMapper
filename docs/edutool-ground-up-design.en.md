# EduTool Ground-Up Design and Implementation Handoff

Date: 2026-09-08  
Status: approved product direction; proposed engineering specification, not an implementation or release claim.  
Audience: a new Codex task implementing the product in a clean repository.  
Language: the application must support English and Chinese content; this specification is in English.

## Contents

- [1. Read this first](#1-read-this-first)
- [2. Product scope and explicit non-goals](#2-product-scope-and-explicit-non-goals)
- [3. Architecture decisions](#3-architecture-decisions)
- [4. Canonical data model](#4-canonical-data-model)
- [5. Commands, revisions, and synchronization](#5-commands-revisions-and-synchronization)
- [6. Local model and generation pipeline](#6-local-model-and-generation-pipeline)
- [7. Compiler and document system](#7-compiler-and-document-system)
- [8. UI/UX specification](#8-uiux-specification)
- [9. Source import, saving, and project portability](#9-source-import-saving-and-project-portability)
- [10. Deliverable-by-deliverable requirements](#10-deliverable-by-deliverable-requirements)
- [11. Export contracts and format parity](#11-export-contracts-and-format-parity)
- [12. Benchmark and evidence design](#12-benchmark-and-evidence-design)
- [13. Required engineering tests](#13-required-engineering-tests)
- [14. Migration and reuse strategy](#14-migration-and-reuse-strategy)
- [15. Implementation milestones and stop conditions](#15-implementation-milestones-and-stop-conditions)
- [16. Release checklist and handoff artifacts](#16-release-checklist-and-handoff-artifacts)
- [17. Worked example: one task carried through the system](#17-worked-example-one-task-carried-through-the-system)
- [18. Known uncertainties and how to resolve them](#18-known-uncertainties-and-how-to-resolve-them)
- [19. Instructions to the implementing Codex task](#19-instructions-to-the-implementing-codex-task)

## 1. Read this first

Build a local-first teaching-material authoring application. A teacher describes a course or lesson, optionally attaches sources, receives substantive teaching materials, edits them directly, and exports classroom-ready files. Related materials share the same underlying teaching content, so a change does not leave different answers or task requirements scattered across documents.

The user has approved exploring a ground-up design. This document is the handoff for implementation; do not spend the first milestone producing another broad roadmap. Begin with the finite model feasibility experiment and a working vertical slice described below.

The priorities, in order, are:

1. Useful, accurate, specific teaching tasks and references.
2. Reliable editing, synchronization, saving, recovery, and export.
3. A simple, familiar interface that gives most space to the materials.
4. Fast deterministic compilation after teaching content exists.
5. Maintainable architecture and bounded local-model resource use.

Do not equate a syntactically valid model response, many generated pages, or passing template checks with a successful lesson. Do not market a deterministic compiler as a small language model. Do not promise that every device can run the same local model.

### 1.1 User constraints that must survive the handoff

- No rented inference server and no dependency on a shared free online inference API.
- Scion is the local AI product entry point. Its actual model configuration must be inspected and tested, not assumed from the name.
- Retain the familiar ten deliverable categories and mature editing behavior associated with the existing product, especially the 0.18.7 UI baseline.
- Keep the homepage, workspace, and agent responses minimal. Do not add a dashboard of agents, scores, warnings, or internal pipeline states.
- Materials must be editable; teacher changes must survive regeneration, navigation, saving, and reopening.
- Preserve rich applicable export capabilities. Do not silently replace existing formats with PDF only.
- Concentrate testing on real outputs and complete teacher workflows.
- On the user's machine, run one inference job at a time and normally one browser test tab. Do not open multiple model-loaded browsers or run heavy export rendering alongside inference.
- Keep real source documents intact. Explicit teacher adaptations must not masquerade as quotations from the originals.
- A new kernel is acceptable; deleting the old product or teacher data is not part of the initial implementation milestone.

### 1.2 Existing project context

The development repository inspected for this design is `/Users/tianxing/CodexProjects/EDUTOOL`, remote `https://github.com/lovejzzz/CourseMapper.git`, branch `codex/v0200-teaching-system`, inspected commit `f7c1e565`. Its package version at inspection is `0.19.2`; it is not a completed v0.20.0 release. The live product domain is `edutool.dev`; this document does not assert what commit is currently deployed.

The environment may initially open `/Users/tianxing/Documents/NYU/NYUsliver/CourseMapper`. Do not assume this is the same checkout. Confirm the target repository, branch, and local instructions before editing. If a new task starts in an empty repository, implement there and use the old checkout only as a donor/reference. If it starts in the old repository without a designated new location, isolate the experiment in a new directory or checkout; do not replace the production application in place.

The old v0.20.0 roadmap and its unfinished gates remain historical commitments, not completed work. Adopting this staged design must not automatically mark the old student-diagnosis, research, export, or production gates complete. The new release number is a release decision, not permission to relabel unfinished work.

### 1.3 Why a new design is justified

At the inspected commit, non-test JS/TS under `src` occupies 664 files and 278,656 lines, including comments, prompts, and static content. The main compiler alone is 28,956 lines. Size alone is not the diagnosis: multiple mutable teaching representations and fallback paths overlap in responsibility.

A fresh local generation produced one lesson and nine derived material categories, but zero shared tasks, after native-contract failure and fallback. It used five model request starts and roughly 53 seconds in that run; that is not a warm latency benchmark. Two small operation-selection protocol experiments achieved only 3/6 and 4/6 valid, expected selections. These are evidence of unreliable current model/protocol combinations, not proof that the base model is incapable.

The development approach also contributed: many local fixes and replays accumulated before the whole fresh-input workflow was proven. The rebuild must change this process, not merely move files.

## 2. Product scope and explicit non-goals

### 2.1 First user and primary job

First serve teachers and trainers preparing lessons. The product's central promise is:

> Turn teaching intent and evidence into a coherent material package; make one meaningful correction without manually repairing every document.

A learner can use the resulting study material, but a separate adaptive student application is not part of the first release. Preserve the requested homepage wording, “What do you want to teach/learn?”, while keeping the initial creation workflow centered on instructional preparation.

### 2.2 Required complete-product capabilities

- Course and single-lesson creation, with or without uploaded sources.
- All ten material categories listed in Section 10.
- Source inspection, explicit fictional examples, and evidence limitations.
- Direct rich editing, task-aware shared edits, local material customization, undo, and history.
- Bounded local generation, cancellation, partial recovery, and resource release.
- Reliable local project persistence and portable project files.
- Student, teacher, and where necessary role-specific exports.
- The existing applicable document, slide, spreadsheet, Google, and package exports, inventoried and verified before replacement.
- Usable desktop and narrow-screen layouts; keyboard navigation and accessible controls.

### 2.3 Defer until the core workflow works

Do not build multiplayer collaboration, accounts, cloud project sync, a vector database, a multi-agent orchestration platform, an autonomous research crawler, LMS grade submission, an adaptive student tutor, or an automated learning-effectiveness claim in the first vertical slice.

Research can later supply inspectable source proposals through the same source-ingestion boundary. It must never silently rewrite accepted teaching content. A browser-only product cannot assume arbitrary websites are fetchable, that search APIs are free, or that an unrestricted proxy is acceptable. Manual file/text import remains sufficient for the first core workflow.

These are explicit sequencing choices, not instructions to remove existing user files or claim the old feature goals have been delivered.

## 3. Architecture decisions

| Decision                      | Implementation rule                                                                       | Reason                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| One teaching authority        | A versioned `Project` contains the editable teaching entities                             | Avoid divergent answers and requirements      |
| Model output is a proposal    | Validate and commit through the same command boundary as user edits                       | Prevent late responses overwriting newer work |
| Materials are projections     | Render teaching content plus explicit local edits                                         | Keep shared content consistent                |
| Pure compiler                 | No network, model calls, storage writes, clock-dependent IDs, or hidden answer generation | Fast, reproducible regeneration               |
| Local-first persistence       | IndexedDB for project transactions; portable archive for backup                           | No server account prerequisite                |
| One runtime interface         | Local model worker with a bounded serial queue                                            | Predictable resource use and cancellation     |
| Shared semantic document tree | Preview and exports consume the same content tree                                         | Reduce content drift across formats           |
| Explicit audience filtering   | Remove restricted data before rendering/export serialization                              | Prevent answer and private-role leaks         |
| One-way legacy import         | Import old projects into the new schema without maintaining two live engines              | Isolate compatibility complexity              |

Use React and TypeScript with a strict project-wide typecheck, Vite, a runtime schema validator, and the existing mature rich-text approach where suitable. These are continuity choices based on the inspected repository, not claims about the newest available versions. The old dependency set includes React, TypeScript, Vite, Tiptap, Zod, wllama, docx, pdfmake, PptxGenJS, JSZip, and PDF/text extraction tools. Verify compatibility and licenses when selecting exact versions; pin the resulting lockfile. Do not copy all dependencies merely because they exist.

Do not introduce a state framework, backend, service worker, or package monorepo unless a measured requirement justifies it. A single application with clear modules is the starting point.

```text
src/
  domain/        schemas, commands, revisions, dependencies, deterministic checks
  generation/    local runtime adapter, protocols, queue, proposal parsing
  sources/       file extraction, paragraph identities, evidence resolution
  documents/     semantic blocks, audience filtering, ten projections
  editor/        rich text, tables, slides, shared bindings, override resolution
  persistence/   IndexedDB repository, project archive, migrations
  export/        PDF, Word, slides, tables, Google, package composition
  app/           homepage, workspace, drawers, navigation, application state
  legacy-import/ one-way readers of verified historical project formats
  diagnostics/   local opt-in development receipts, no default content telemetry
```

Dependency direction: `domain` imports none of the UI/runtime/export modules; projections read domain data; editors issue domain commands; generation submits proposals; persistence commits domain transactions; exporters consume audience-filtered semantic documents. Application wiring coordinates these pieces.

## 4. Canonical data model

The contracts below define intended semantics. Implement concrete runtime schemas and discriminated TypeScript unions; do not turn the conceptual examples into a loosely typed object bag. A schema change requires a migration and fixture coverage.

### 4.1 Project envelope

```ts
type EntityId = string; // application-generated stable ID, never an array index
interface Project {
  schemaVersion: 1;
  id: EntityId;
  revision: number; // increments only on successful committed changes
  title: string;
  language: string;
  audience: { description: string; priorKnowledge: string[] };
  course: Course;
  sources: Record<EntityId, SourceRevision>;
  lessons: Record<EntityId, Lesson>;
  tasks: Record<EntityId, TeachingTask>;
  content: Record<EntityId, TeachingContent>;
  materialEdits: Record<EntityId, MaterialEdit>;
  createdAt: string;
  updatedAt: string;
}
```

The canonical envelope holds current entities. Revision records, binary attachments, and long generation receipts can live in separate storage records indexed by project ID; they belong in the portable archive. Do not duplicate the full revision history inside every projection. `schemaVersion` describes the file contract, not the marketing release version.

Use a typed entity registry and reference validation. Every task, requirement, criterion, evidence reference, content block, and override needs a stable identity. A copied independent task gets new IDs and a `derivedFromTaskId` provenance link; it is not another view of the original task.

### 4.2 Course and lesson content

`Course` owns ordered lesson IDs, course objectives with IDs, optional prerequisite statements, teacher-provided policies, assessment arrangements, and course-level content references. Unknown institution, grading policy, semester, or attendance requirements remain absent or editable placeholders; never fabricate them.

`Lesson` owns its title, measurable objectives, duration in minutes, prior-lesson dependencies, ordered activities, and references to tasks and reusable explanations. Each activity records a purpose, time allocation, student action, teacher action, required resources, and optional task/content references. Sum and compare durations to the lesson budget; do not manufacture timing precision unsupported by the activity.

`TeachingContent` holds authored teaching material that is not a task: explanations, worked examples, discussion facilitation notes, course FAQ entries, and visual specifications. Give each block a kind, rich body, audience classification, evidence references where applicable, and provenance. A worked example may reference a task and its answer; do not copy the answer into an independent editable string.

This extends the single authority beyond tasks. Slide narration and teaching explanations must have an explicit owner instead of being invented separately by each renderer.

### 4.3 Sources and evidence

A `SourceRevision` includes:

- Stable document ID, immutable revision ID, display name, language, and content hash.
- Origin: uploaded file, pasted text, teacher-authored example, teacher correction, or later verified web import.
- Attachment hash/reference and extracted paragraphs with stable IDs within the revision.
- Page/section locations when extraction supports them; no fabricated page numbers.
- Extraction status and limitations, such as missing OCR or uncertain table order.
- For web imports, original URL and retrieval date; no invented “current” status.

An `EvidenceRef` identifies the exact source revision, paragraph ID, quoted text, and optional character span. Resolve offsets in application code using a documented Unicode indexing convention; test Chinese and multi-code-unit characters. A unique exact match can be resolved automatically. Multiple matches require additional context or review. Do not choose the first ambiguous match silently.

Separate `quoteResolved` from `claimSupported`. Finding text proves the quote exists; it does not prove a denominator, causal claim, or date interpretation is correct. Semantic support records who assessed it and against which task/source revision.

Teacher corrections create a new revision or an explicit adapted-example entity with a `derivedFrom` link. Never overwrite original extraction and retain the same provenance identity. Uploads and quotes are untrusted data, not model or application instructions.

### 4.4 Teaching task

A task contains:

| Field                     | Meaning                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `id`, `revision`, `title` | Stable identity and current entity revision                                   |
| `objectiveIds`            | Specific lesson/course objectives addressed                                   |
| `context`                 | Student-visible conditions and necessary source context                       |
| `prompt`                  | The actual question or work to perform                                        |
| `requirements[]`          | Stable-ID outputs or reasoning the student must provide                       |
| `evidenceRefs[]`          | Source references used by this task                                           |
| `parameters[]`            | Optional typed premises for supported deterministic operations                |
| `answer`                  | Expected result, reasoning steps, acceptable alternatives, and limitations    |
| `criteria[]`              | Requirements, observable evidence, score levels, and point maxima             |
| `misconceptions[]`        | Concrete error response, explanation, diagnostic evidence, next-step feedback |
| `practiceTaskIds[]`       | Independent practice/transfer tasks, not disguised duplicates                 |
| `review`                  | Draft/review-needed/reviewed state tied to a content revision                 |
| `provenance`              | Model proposal, teacher authoring, adaptation, and source lineage             |

Answer reasoning steps have stable IDs and references to premises/evidence. Criteria reference requirement IDs and, where useful, reasoning steps. A criterion must never grade a requirement that the student was not asked to fulfill.

Review status belongs to a specific revision. Editing semantic content invalidates the previous review for the affected content. Successful compilation, export, or a model self-check never sets `reviewedByTeacher`.

Audience classification must be attached to exportable content fields/blocks, not just the whole task. The same task contains a public prompt and a teacher-only answer. Use an explicit union such as `public | teacher | role:<id>`; a student request receives public content only, a role packet receives public plus that role, and a teacher export includes restricted content only in intentionally selected reference sections. Each rubric level may need a student-facing descriptor and a teacher-only evidence anchor; these have different purposes, not two editable answer authorities. Derived answer references remain bound to the canonical answer. Unknown classification fails closed in student/role export.

Store scoring levels as explicit allowed values and anchored descriptions. Compute total points from criteria; do not maintain a separate mutable total. Define rounding and partial-credit policy where needed. Do not assume every task needs exactly four rubric levels.

### 4.5 Typed calculations and rich text references

For supported calculations, represent premises using typed parameters, for example a numerator count, denominator count, and population/time scope. Define deterministic operations as a small explicit union, starting with ratios and only adding operations that have tested semantics.

Rich text can reference a parameter/result node rather than embedding another mutable copy of a number. A template can render “16 of 40 radios” and a percentage from the same parameters. Parameters must carry their source/adaptation references and scope; `16 / 40` being numerically correct does not establish that the quantities belong together.

Do not build a universal theorem prover or silently parse arbitrary prose into formulas. Unsupported reasoning remains authored/model-proposed content requiring review. Changing a parameter invalidates any unbound explanation that depends on it; automatically replace only dependencies whose transformation is explicitly supported.

### 4.6 Material edits and view identity

A material view is addressed by `(projectId, materialKind, scopeId, audienceVariant)`. A projected block has a stable key derived from entity ID, semantic role, and occurrence—not its current array position or text hash.

`MaterialEdit` variants:

- Layout edit: block placement, slide layout, widths, or display style.
- Local insertion: teacher-authored material-specific content at stable anchors.
- Local override: replacement content for an identified projected field/block, with the base value/revision and dependency fingerprint.
- Local hide/reorder: explicit material-specific presentation change; does not delete the teaching task.

For a local override, record `baseValue`, `baseEntityRevision`, the current local value, and explicit dependency IDs. Compare three values when the upstream field changes:

1. Local equals base: discard the redundant override and use upstream.
2. Upstream equals base: keep the local value without a conflict.
3. Local equals upstream: resolve to the shared value.
4. Both differ from base and from each other: retain the local value and mark a conflict; do not auto-merge prose.

A local note inserted inside a task section conservatively depends on that task unless deliberately authored as unrelated material content. A semantic task change invalidates that dependency's reviewed state. This avoids claiming the system can discover every implicit factual reference in arbitrary teacher prose.

An override is deliberately local and must never be inferred as a shared correction. Store the value against which it was made so conflicts can be identified. Orphaned edits move to a recoverable section if their anchor disappears; do not drop them.

## 5. Commands, revisions, and synchronization

### 5.1 One mutation boundary

All canonical writes use typed commands. Initial command set:

```text
CreateProject
AddSourceRevision
ApplyCoursePlanProposal
AddTaskProposal
UpdateSharedField
UpdateTypedParameter
ApplySemanticRevision
SetMaterialOverride / RemoveMaterialOverride
InsertLocalBlock / UpdateLayout
RecordTeacherReview
UndoTransaction / RedoTransaction
ImportProject
```

A command envelope contains `commandId`, project ID, expected project revision, actor, and a validated payload. Commands carry target entity revisions where applicable. Application-level IDs and permissions are not accepted blindly from model output.

Transaction steps:

1. Load the current revision and validate target identities.
2. Reject stale proposals; do not automatically rebase semantic changes.
3. Apply the command to an isolated candidate state.
4. Validate references, supported calculations, audience classifications, and dependency changes.
5. Compute invalidated reviews, affected views, and override conflicts.
6. Atomically persist the next revision and its reversible change record.
7. Publish the committed state; invalidate only affected projection caches.

For responsive typing, maintain an editor buffer immediately and debounce grouped text transactions. Suggested initial debounce: 400 ms; flush on blur/navigation and before export. The exact interval is tunable. Do not wait for a browser-unload async operation to preserve the only copy. A failed save leaves the buffer accessible and offers a project backup; never display “Saved” before durable commit.

Use project revision as the simple concurrency boundary initially. Another tab opening the same project should become read-only or explicitly take over the writer role using a browser coordination mechanism with a safe fallback. Do not implement collaborative merging. Revalidate the revision in the storage transaction even if a writer lock exists.

### 5.2 Shared text versus semantic dependencies

Direct edits to a shared prompt update every view of that prompt without another confirmation. They do not automatically prove that the answer still fits. If requirements, conditions, or facts change, mark dependent answer/rubric content for review and offer a revision proposal.

For typed deterministic changes, recompute supported results atomically. Any free-form dependent passage without a safe transformation becomes review-needed. This is preferable to either stale answers or a model call on every keystroke.

Cross-material semantic AI changes are one proposal containing the affected prompt, requirements, answer, criteria, and feedback. Show one meaningful preview, then commit all changes together. A new user edit after preview makes it stale; retain it for comparison but require recomputation or deliberate manual application against current content.

### 5.3 Required synchronization examples

**Example A: corrected exercise population.** Teacher changes a fictional exercise denominator from 40 to 50; numerator remains 16. The typed ratio result becomes 32%. Referenced prompt, worked calculation, answer, and bound scoring evidence update in one commit. The source file remains unchanged; the exercise records an adaptation. Unbound interpretations are flagged for review.

**Example B: question meaning changes.** Teacher changes “calculate the completion proportion” to “explain whether a policy caused the completion rate.” The old answer must not remain silently accepted. The proposed revision must identify whether causal evidence exists; lacking evidence, it must state the limitation or propose an appropriate task. No compiler template invents causation.

**Example C: teacher-customized slide.** The slide contains a local analogy. A shared task correction updates referenced task content but preserves the analogy. If the analogy overrides the corrected field, show that one conflict with keep/update/compare choices. Do not block unrelated materials.

**Example D: undo.** Undoing A restores prior parameter/result values and the corresponding review/override state as a new transaction. It does not blindly replace the entire project with an old snapshot, losing unrelated later edits. Apply an inverse patch only when each affected current value still matches the transaction's expected after-value. If later edits overlap, offer a concrete revert preview against the current state; do not silently erase them. Ordinary text undo groups local typing transactions; project-level semantic undo follows these revision rules. Redo requires the same conflict checks.

### 5.4 Regeneration semantics

- “Refresh layout” is pure re-projection with no model call.
- “Revise with AI” proposes teaching changes for a selected scope.
- “Generate a new practice task” creates a new task identity.
- Avoid a generic regeneration action that might unpredictably replace content or layout.
- Preserve teacher edits by default. Explicitly replacing a customized section requires a concrete preview, not silent deletion.

## 6. Local model and generation pipeline

### 6.1 Runtime contract

```ts
interface LocalModelRuntime {
  inspect(): Promise<RuntimeCapabilities>;
  load(config: VerifiedModelConfig, signal: AbortSignal): Promise<void>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<GenerationEvent>;
  unload(): Promise<void>;
}
```

Define concrete request/event unions in implementation. Required events: loading progress when known, generation started, output chunk, completed, cancelled, and failed. Separate load and generation timings. Do not stream hidden reasoning into the user interface or export it as teaching content.

`VerifiedModelConfig` records model ID, base identity when verified, revision, quantization, tokenizer/chat template, runtime version, context/output budgets, artifact sizes/hashes, and optional adapter identity. Before reuse, inspect the old Scion runtime and manifests. A product label or filename is not sufficient evidence of base model or adapter compatibility.

Keep inference in a worker where supported. Use one active job, bounded queued work, cancellation IDs, and a stale-result check. Cancel must stop the actual job where the runtime supports it; otherwise dispose/restart the worker and ignore all late events. Record the behavior honestly. Do not start another heavy generation while the previous job is still running.

### 6.2 Model feasibility experiment: first engineering milestone

Before building the full workspace, create a small local harness that loads the candidate model and produces complete task proposals from source/goal inputs.

Prepare 12 previously unused inputs, three families of four, balanced English/Chinese:

1. Quantitative evidence: correct population, unit, denominator, and limitations.
2. Chronology/attribution: distinguish event time, record time, inference, and source attribution.
3. Explanation/argument: supported interpretation, reasonable alternatives, and evidence limits.

Include enough complexity to expose shallow behavior. Pre-register expected facts and meaningful requirements independently of model output. Existing failures remain regression cases; they do not count as fresh inputs.

Compare two predefined protocols on the same inputs:

- A: one compact structured task response.
- B: one content response followed by one bounded structure-normalization call.

Set the model configuration, output budget, and repair policy before comparing. Permit at most one additional structural repair per task in either arm, disclose every actual call, and distinguish planned normalization from error repair. Repairs may recover structure but cannot be credited for silently changing the underlying task/answer. Store raw and parsed outputs and any semantic differences. Choose based on usable teaching content, total time, and failure visibility, not JSON validity alone.

Suggested feasibility gate: at least 9/12 usable tasks without rewriting the core task and answer, with at least 2/4 usable in each family. This gate only justifies building the vertical slice; it is not a public quality claim. Also report every per-family result; weak families cannot be hidden by the total. Test the chosen protocol on a fresh balanced confirmation set before expanding scope.

If both predefined protocols fail materially, stop UI expansion and make a concrete model/task-scope decision. Compare an appropriate alternative local model or a measured adapter experiment, or document a narrower automatic capability. Do not spend unlimited iterations on labels, routing heuristics, templates, and retries for the same twelve examples. If a product tradeoff requires the user's decision, present the measured alternatives succinctly.

### 6.3 Production pipeline after feasibility

1. **Capture intent.** Extract topic, learner level, language, duration, output scope, and attached sources. Preserve the user's full stated objective. Ask at most one material clarifying question when a reasonable default would fundamentally change the task.
2. **Ingest sources.** Extract and segment text, retaining source revisions and extraction limits. Do not silently truncate documents or assume unextracted scanned pages are blank.
3. **Plan the course.** For multiple lessons, propose a concise sequence with objectives and activity/task needs. For a simple single lesson, avoid an unnecessary separate planning call if the selected protocol can cover it.
4. **Select context.** Use explicit lesson/source associations and bounded lexical retrieval initially. Keep nearby qualifiers. Record which paragraphs were supplied; relevance selection is not evidence verification.
5. **Generate task/content proposals.** Work serially, one bounded teaching unit at a time. Include task, reasoning, answer, rubric, and feedback together rather than generating ten unrelated documents.
6. **Resolve and check.** Validate schema, quote matches, references, calculations where supported, and structural alignment. Keep semantic uncertainty visible. No generic filler as fallback.
7. **Commit valid draft entities.** A lesson can appear as an editable draft before teacher review. Incomplete content can be saved with issues; do not label it complete.
8. **Compile material views.** Pure projections use the committed teaching content. No further inference per format.
9. **Teacher editing and review.** Normal edits operate directly on content; semantic proposals use the revision system.

The call budget is based on teaching work, not the number of deliverables. A six-lesson course can legitimately need more than one call. Do not promise instant full content generation; measure the much faster post-content compilation separately.

### 6.4 Failure and resume state machine

Persist a generation job record separately from canonical teaching content:

```text
queued -> loading -> planning -> generating-unit -> checking -> committing
                                            |                     |
                                            v                     v
                                         failed             next-unit / completed
any active state -> cancelling -> cancelled
interrupted browser session -> interrupted (never pretend still running)
```

The record includes job ID, target project revision, completed unit IDs, source/context hashes, model/protocol identity, and last safe checkpoint. Resume only the unfinished unit against current project state. Recheck sources/revisions first. Never rerun completed teacher-edited lessons merely to finish another lesson.

Errors use concrete categories: unsupported device, model download, insufficient memory, context too large, invalid response, unresolved evidence, cancellation, stale proposal, or persistence failure. Show one short actionable message at the relevant location. Full diagnostics are available on demand, not a normal teacher dashboard.

### 6.5 Resource and network policy

- Inspect capability before downloading gigabytes. Disclose a verified download size at the generation entry point when necessary.
- Keep model artifact download/cache separate from private project storage. Clearing the model must not delete teacher projects.
- Lazy-load inference and export libraries. Browsing an existing lesson should not load the model.
- Do not call a cloud model as an automatic fallback.
- Verify model artifact distribution terms, URL availability, and integrity before public deployment. Static hosting is not a guarantee of free unlimited model bandwidth.
- Provide a manual model-release action in a small settings surface; preserve the project and pending drafts.
- Offline editing/export is an engineering target once required assets are available. Do not claim cold-start offline generation until tested.

## 7. Compiler and document system

### 7.1 Pure projection API

```ts
compileMaterial(
  project: Readonly<Project>,
  request: { kind: MaterialKind; scope: MaterialScope; audience: Audience },
): { document: SemanticDocument; issues: MaterialIssue[]; dependencies: DependencyRef[] }
```

`SemanticDocument` contains typed headings, paragraphs, lists, tables, task references, answer spaces, figures, slide sections, and explicit page/layout hints. Rich text supports safe formatting and semantic references. Generated documents are caches, not canonical editable copies.

Run audience filtering before passing a document to a format writer. Apply local overrides with retained audience/provenance metadata. A local edit does not gain permission to expose a teacher-only subtree. A teacher deliberately entering an answer into a public question cannot be perfectly detected; prevent structural leaks and provide audience previews rather than pretending to solve arbitrary semantic leakage.

### 7.2 Content versus presentation

The compiler may select existing explanations, arrange activities, number tasks, compute supported values, generate tables of contents, and produce answer-free student views. It must not manufacture new subject facts, discussion arguments, alternative answers, misconceptions, or independent practice just to fill a template.

If a slide needs a diagram that has not been authored, emit a specific missing-content issue or an editable diagram placeholder. Do not claim a diagram exists because its caption exists. Initial diagram support can use simple labeled vector primitives for relationships/timelines; do not add an image-generation API dependency.

### 7.3 Stable layouts and performance

Use stable block IDs and dependency fingerprints to avoid replacing an entire editor on a small edit. Cache per material/scope/revision and invalidate only impacted projections. Repeated compile calls with the same inputs must produce the same semantic content and keys.

Proposed targets to measure on the user's actual machine, excluding inference, first library load, and file encoding:

- Visible one-lesson re-projection: p95 under 250 ms.
- Ten views of a six-lesson prepared course: p95 under 2 seconds.
- Ordinary editor input remains responsive while background compilation runs.

These are engineering targets, not existing measurements. If missed, profile and simplify before introducing workers or parallel pipelines. Heavy exports run serially with progress/cancellation, avoiding simultaneous inference memory pressure.

## 8. UI/UX specification

### 8.1 Visual direction

Keep the restrained, familiar 0.18.7 interaction baseline. The ground-up design is not a mandate to redesign every control. If the old checkout/tag is available, capture the baseline homepage, material navigation, and mature editor interactions before implementing parity.

Use clear typography, whitespace, and readable paper-like document surfaces. A restrained chalk/hand-drawn accent may appear in the brand or empty state; do not introduce chalk-textured writing surfaces, decorative handwritten body text, or animation that reduces reading/editing quality. Content print/export defaults to a clean light page regardless of application theme.

Initial layout tokens, adjustable after visual testing:

- 8 px spacing scale, with 4 px for compact internal gaps.
- Desktop material navigation around 208 px wide, collapsible.
- Main document comfortable reading width around 800 px; tables/slides may use more width.
- One contextual drawer, approximately 360 px when space allows; otherwise overlay/full screen.
- Body text around 16 px in application reading surfaces; document typography is material-specific.
- Interactive targets around 44 px for primary touch actions; visible keyboard focus and adequate contrast.

These are design choices, not a claim of formal accessibility certification. Validate actual keyboard and screen-reader behavior.

### 8.2 Homepage

```text
                            EduTool

                 What do you want to teach/learn?

           +----------------------------------------+
           | Describe the lesson or course...       |
           |                                        |
           | Attach files                           |
           +----------------------------------------+
             [source.pdf x]        Course settings

                         Generate materials

                   Continue last project · Open file
```

Behavior:

- One multiline input accepts a teaching request and file drops.
- Empty file state does not show a large upload wizard. After attachment, show filename, extraction state, and remove action.
- Enter inserts a newline; an accessible explicit button submits. Optional keyboard shortcut is shown in the control tooltip, not required knowledge.
- Disable submission only for a truly empty request with no usable source. Source-only requests can ask one concise goal question or propose an editable default.
- Defaults: input language, one lesson when no course length is stated, and clearly editable level/duration. Store defaults as assumptions, not user-provided facts.
- “Course settings” opens a small optional panel for audience, duration, language, and lesson count. Do not force a multistep setup process.
- No mandatory sign-in, provider dropdown, API quota, quality score, feature-card wall, or long agent greeting.
- Resume restores the last project and working location. Open file remains available even if the device cannot run the model.

### 8.3 Desktop workspace

```text
+------------------------------------------------------------------+
| Project title                   Saved             Revise   Export |
+-------------------+----------------------------------------------+
| Course Map        | Lesson 2 v                  Editing tools     |
| Syllabus          |                                              |
| Lesson Plans      | Real material content                         |
| Slide Decks       |                                              |
| Assignments       | Click and edit directly                       |
| Rubrics           |                                              |
| Discussions       |                                              |
| Quiz Bank         |                                              |
| Study Guides      |                                              |
| Course FAQ        |                                              |
|                   |                                              |
| Sources and files |                                              |
+-------------------+----------------------------------------------+
```

- Two persistent columns, no always-open chat pane.
- Left navigation switches material type in one action. Preserve full familiar names in accessible labels even if compact display names are used.
- Lesson selector appears for lesson-scoped views; course-level syllabus does not have an irrelevant selector.
- The central region is the actual editor, not a preview requiring another “Edit” page.
- Open the first usable lesson plan or assignment after generation. Do not land on a success dashboard.
- Preserve scroll, selection, and editor buffers when navigating.
- Sources, revision preview, and history use the same contextual drawer position; do not stack three sidebars.
- Quiet saved/saving state in the header. A save failure stays visible with a backup action until resolved.

### 8.4 Editing behavior by surface

- Prose: mature rich-text editing, paragraphs, headings, lists, tables, links, paste normalization, keyboard selection, undo/redo.
- Course Map and rubric: real table editing; resizing, keyboard cell movement, and text wrapping. Do not force users to edit JSON.
- Slides: slide thumbnails, editable text blocks, safe layout choices, reorder, notes, and presentation preview. If reusing the old slide editor, verify shared bindings and local layout preservation through its adapter.
- Shared fields: a small focus-time hint such as “Used in assignment, slides, and rubric”; expand only on demand.
- Local-only change: field/block menu offers “Only in this material.” Keep a subtle override indicator with a reset-to-shared action.
- Deleting a shared task is distinct from hiding it in one document. Shared deletion shows concrete affected uses and is undoable.

### 8.5 AI revision, concise by design

The header “Revise” action and a text-selection action open the same small input surface:

```text
Scope: This task v
Require students to explain why averaging the two percentages is wrong.
                                                    Propose changes
```

Default scope is the selected task/content; otherwise the current lesson. A whole-course change must be explicitly scoped. Common shortcuts may include clarify, adjust difficulty, and new practice, but do not create separate agents for them.

The response is the proposed content and a short summary, e.g. “Proposed changes to the question and two scoring criteria.” No long chain of thought, execution transcript, or repeated explanation of the user's request. Ask only a question that materially changes the output.

For semantic changes, show one preview with changed task, answer, and rubric content; allow apply or keep original. Ordinary typing, deterministic recomputation, saving, and navigation do not require confirmations.

### 8.6 Sources and issues

Source markers open the full relevant excerpt and location. Include surrounding qualifiers; a shortened quote preview must not be the only inspectable evidence. Large source collections have search and explicit lesson associations, not a manual binding spreadsheet.

Show issues close to affected content: “This answer uses a total not present in the source” is useful; “AI may be inaccurate” repeated everywhere is not. Distinguish missing content, unresolved evidence, and structural failures. A collapsed issue entry can summarize multiple items without hiding their details.

Drafts remain editable. Block an operation only when it cannot safely produce what it claims—for example, a student export with a structurally unresolved audience boundary. An incomplete draft may be exported explicitly as a draft; never silently call it classroom-ready. Do not add a mandatory teacher-review wizard to every lesson.

### 8.7 Export drawer

One entry point, three visible choices:

```text
Export
Audience       Student / Teacher
Format         PDF v
Scope          Current lesson v
                                          Export
```

Show only applicable formats for the current material; package export is an available scope/action. Remember suitable recent settings, but always show audience and scope. Assignments and quizzes default to student output; teacher-only plans default appropriately. A classroom slideshow defaults to student-visible content, with teacher notes handled explicitly.

After success, provide the file or created-document link. After failure, retain selections and offer retry. Do not clear material edits. A partial package must list failed items and cannot be labeled complete.

### 8.8 Generation, recovery, and small screens

Generation opens the workspace and reveals committed lessons progressively. Show truthful progress such as “Preparing lesson 2 of 6,” plus one stop action. On interruption, keep completed lessons and expose resume for unfinished work. Avoid speculative percentages and internal token/stage jargon.

Below an initial 900 px breakpoint, collapse navigation into a material picker; below approximately 600 px, use a single-column document view and full-screen contextual panels. Verify breakpoints with actual content rather than treating these numbers as universal.

No hover-only action. Preserve focus when drawers close, label controls, support keyboard escape and undo, and avoid background focus behind modal overlays. Viewing, editing, and export compatibility must be tested separately from local inference compatibility.

### 8.9 Interaction acceptance targets

| User job                       | Expected default path                                     |
| ------------------------------ | --------------------------------------------------------- |
| Start from a clear goal/source | Input/drop, then one Generate action                      |
| Switch material                | One navigation action                                     |
| Edit ordinary content          | Direct click/select and type                              |
| Change a shared typed fact     | One edit; supported dependent values update automatically |
| Approve semantic revision      | One meaningful diff preview                               |
| Export with suitable defaults  | Open Export, then Export                                  |
| Resume work                    | One Continue action; prior location restored              |

Record confusion, missed controls, repeated entry, and required manual cross-checks. A low button count is not proof of usability.

## 9. Source import, saving, and project portability

### 9.1 Input handling

Initial supported text-bearing inputs: plain text/Markdown, text PDFs, and DOCX, plus pasted text. Inspect the existing import surface and record any additional supported format before declaring parity. Scanned PDFs require OCR; do not add an implicit paid service or pretend empty extraction is success. Explain the limitation and allow pasted text or an alternative file.

Retain originals and extraction metadata. Preserve table structure sufficiently to avoid mixing headers, rows, units, or footnotes. If uncertain, show a source issue before a dependent quantitative task is accepted. Bound file size, archive expansion, extraction time, and context size using documented configurable limits; choose defaults from local resource tests. Reject oversize/unsupported files clearly without losing the existing project.

### 9.2 Persistence

Suggested IndexedDB stores: projects, revision records, attachments, generation jobs, and workspace preferences. Persist canonical transaction and revision metadata atomically. Reference immutable attachment records by hash; an attachment write failure must not leave a committed dangling source.

Workspace preferences—selected lesson, material, drawer, scroll—are separate from teaching revisions. Store schema migrations with fixtures and make migrations transactional. Never mutate the only old-format copy in place.

Request persistent browser storage where supported, but do not claim the browser can never evict data. Offer project-file backup through ordinary project actions. Notify about an actual save failure, not constant hypothetical warnings.

### 9.3 Portable project archive

Proposed extension: `.edutool`, ZIP container with:

```text
manifest.json       archive version, project ID, revision, attachment hashes
project.json        canonical current teaching content
history.json        supported revision history or explicitly bounded history
attachments/        original source binaries keyed by safe hash names
```

Persist interrupted-job checkpoints when useful, but do not automatically resume inference on import. Exclude model weights, authentication tokens, and full model diagnostics by default. An editable project contains teacher content and answers: it is a teacher working file, not a student handout. Offer it through project save/open, separate from student export.

Validate manifests, hashes, paths, references, file counts, expanded size, and schema versions before committing imports. Prevent archive path traversal and script execution. Do not silently discard unknown future schemas; preserve the file and report incompatibility.

## 10. Deliverable-by-deliverable requirements

Ten categories means Course Map plus nine derived material categories; do not misreport “nine materials” as a missing category when the map is counted separately. Conversely, navigation labels alone do not establish completed content.

| Material           | Canonical inputs and teaching purpose                                    | Classroom-ready acceptance                                                                                           |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Course Map         | Ordered lessons, objectives, activities, assessment relationships        | Real objective coverage; sensible sequence; time/workload coherent; editable tables and optional columns             |
| Syllabus           | Course scope, prerequisites, assessment arrangements, supplied policies  | No invented institutional policy; consistent dates/weights; clear course expectations                                |
| Lesson Plans       | Activity sequence, task/explanation references, time and resources       | A teacher can deliver the lesson; concrete teacher/student actions, checks for understanding, and transitions        |
| Slide Decks        | Teaching narrative, visuals, task prompts, notes                         | Legible text; appropriate density; meaningful diagrams when needed; answers revealed only in intended audience/stage |
| Assignment Briefs  | Context, requirements, sources, submission expectations, work space      | Solvable from supplied information; clear output; adequate answer space; no teacher key in student copy              |
| Rubrics            | Requirement IDs, observable evidence, anchored levels, points            | Distinguishes correct/partial/misconceived work; scores total correctly; does not assess unrequested work            |
| Discussion Prompts | Evidence-based question, plausible competing interpretations, follow-ups | Requires meaningful reasoning; permits supported alternatives; teacher facilitation is separate                      |
| Quiz & Exam Bank   | Assessable tasks, independent variants, scoring and answer references    | Questions are not duplicates disguised by wording; correct answers and partial credit align; audience separation     |
| Study Guides       | Concepts, worked examples, self-checks, independent practice, feedback   | Complete explanations; practice before its answer; explicit transfer beyond copying the example                      |
| Course FAQ         | Actual course/task requirements and known constraints                    | Answers real learner questions; no filler paraphrases or invented policy                                             |

All material content is authored in canonical task/content/lesson entities or explicit local edits. Each renderer has a different instructional organization; it is not merely the same paragraph pasted ten times.

Do not require arbitrary counts of activities, criteria, or misconceptions for every task. Require enough substance for the actual learning objective. If the topic needs visual/spatial evidence, a text-only template is not automatically classroom-ready.

## 11. Export contracts and format parity

### 11.1 Inventory before replacement

The old repository has document/CSV exporters, slide-specific PDF/PPTX paths, Google Docs/Sheets conversion, spreadsheet utilities, rubric gradebook export, and package composition. These observations establish implementation surfaces, not proof that every UI format works for every material.

During milestone A/B, create `docs/export-parity.md` from actual old UI and code. For each material × format, record: offered by baseline, intended audience, scope, donor code, working/failed/untested, and verification artifact. Restore all applicable baseline paths before replacing the old site. Do not silently narrow scope to the proposed minimum below.

### 11.2 New format organization

- PDF and DOCX for prose/table materials, using semantic content with format-specific pagination.
- PPTX and presentation PDF for Slide Decks; editable native text/shapes whenever feasible, not screenshots of each slide.
- CSV/XLSX for meaningful tabular representations, including map, rubric/gradebook, and question bank; preserve any additional baseline tabular views.
- Google Docs/Sheets through explicit user-triggered authenticated conversion; optional to core offline use but required to verify if retained as an offered release feature.
- ZIP packages with requested materials, distinct student/teacher/role folders, and a concise manifest of successes/failures.
- Portable project archive as a separate teacher save operation.

Do not create misleading formats such as flattened slide CSV pretending to preserve presentation layout. If the baseline offers a textual slide-table export, label its actual representation clearly.

Google exports are snapshots. Do not imply edits in Google documents flow back into the project. OAuth runs only when requested; keep credentials out of archives/logs. Verify current official integration requirements when implementing and record the exact scopes. A blocked live integration is “unverified,” not passed on the strength of a mocked request.

### 11.3 Audience and privacy rules

Filter before any formatter builds XML, PDF objects, notes, hidden slides, spreadsheet cells, metadata, or attachment bundles. Student exports must not contain restricted answer-key content in hidden fields, alternate text, speaker notes, or unused worksheet regions. An intentionally public worked example can include its answer; that does not authorize exposing the private key to a separate assessment. Model this distinction explicitly instead of stripping every mathematical result from student material. Role-specific exercises export separate role packets; never include all private role instructions in the public packet.

Teacher audience is permission to include reference material, not a requirement to cram all answers beside every prompt. Organize answer keys and explanations to be usable. Course-source excerpts intended for students must be explicitly included; do not automatically bundle all uploaded teacher files.

Sanitize rich HTML/pasted content and disallow executable URLs. Escape spreadsheet formula-like user content where it should be literal text, without corrupting intentional numeric values. Use safe filenames and revoke temporary object URLs.

### 11.4 Visual acceptance

For every applicable format, verify real output, not only serializer success:

- No clipped text, off-page tables, accidental blank pages, orphaned headings, or unreadable shrink-to-fit.
- Appropriate font sizes, line spacing, answer space, repeated table headers, and page breaks.
- English and Chinese glyphs render; fonts and embedding licenses are verified.
- PPTX text remains editable and fits in the target slide layout; notes and reveals follow audience rules.
- DOCX tables and headings remain editable; PDF content is selectable where the exporter supports it.
- Headers, question numbers, criteria, scores, source labels, and keys agree with the current project revision.

Inspect PDF pages and actual office-rendered files where tooling is available. Parsing DOCX/PPTX XML alone does not prove visual quality. Record unavailable viewers as a verification gap. Exporting a stale project revision after pending edits is a failure.

## 12. Benchmark and evidence design

### 12.1 Separate the claims

Maintain distinct results for:

1. Natural local generation without teacher repair.
2. Generation with disclosed normalization/repair.
3. Teacher-corrected completion and editing effort.
4. Deterministic compile/sync correctness.
5. Persistence and recovery.
6. Real exported-file quality.
7. Production deployment and browser behavior.
8. Independent teacher review or measured learning effects, when available.

Never collapse these into one “quality 95%” score. An agent's semantic review is useful but is not independent teacher validation.

### 12.2 Per-deliverable rubric

Score each applicable dimension from 0 to 3 with notes and actual excerpts:

- **0:** unusable or materially wrong.
- **1:** substantial teacher rewriting required.
- **2:** usable with limited, clearly identified corrections.
- **3:** ready for the specified classroom use after review, without substantive rewriting.

Dimensions: objective alignment; task specificity and solvability; reasoning/answer correctness; evidence handling and limitations; rubric discrimination; concrete misconception feedback; instructional sequence/workload; cross-material coherence; editability; export readability. Mark genuinely inapplicable dimensions as N/A with a reason; do not inflate the average.

Critical failures override aggregate scores: wrong key, unsupported decisive claim, fabricated citation, impossible task, grading unrequested work, private-answer leakage, lost teacher edit, or stale conflicting versions. A benchmark may faithfully record a failed output; a release sample cannot retain such a failure and be called classroom-ready.

Test rubric discrimination with explicit correct, partially correct, and plausible misconception responses. Document why each earns its score. Include acceptable alternate reasoning for open tasks; do not grade only exact phrase matches.

### 12.3 Dataset and no-overfitting policy

- Preserve the existing frozen `benchmarks/classroom/v3` if available; do not edit it to make the new implementation pass.
- Its historical manifest SHA is `f84e51998f42ca29dd778e60d43bf48c74f0382038c99d368aa0a9b31f23335c`; inspect its verification script to reproduce the correct hash procedure rather than hashing an arbitrary file.
- The old suite comprises 60 cases, including 36 development and 24 reserved cases. It remains a regression/acceptance resource, not a substitute for fresh natural generation.
- Pre-register new feasibility and confirmation inputs and annotations before running the model.
- Keep protocol development and reserved evaluation separate. Once a reserved failure informs a fix, disclose that exposure and use new unseen cases for a new generalization claim.
- Do not generate reference answers with the same procedure being assessed and then use exact equality as proof of semantic correctness.

### 12.4 Release evaluation set

Before replacing the old website, complete three newly generated six-lesson courses:

- English quantitative/data-literacy course.
- Chinese chronology/source-interpretation course.
- English or Chinese explanation/argument course, chosen to expose reasoning and source limitations rather than repeat numeric templates.

Each must include all ten categories at the appropriate course/lesson scopes, independent practice, meaningful answers/feedback, manual shared and local edits, semantic revision, cancellation/recovery, save/reopen, and every applicable offered export path. Review all lesson content and output files, not one attractive first page.

For any automated natural-generation success claim, use a separately registered unseen set. Proposed release screening: at least 80% usable unassisted tasks in each declared supported family, with all failures exposed and disclosed; set denominators and assessment rules before running. This does not supersede stricter old release gates if the new release still claims to fulfill them. The 9/12 feasibility gate is not a replacement for release evaluation.

If a supported-family claim fails, do not quietly remove hard cases or relabel teacher-repaired tasks as natural successes. Narrowing advertised scope is an explicit product decision.

### 12.5 Performance and resource evidence

Measure cold model load/download separately from warm generation, structural repair, compile, and file encoding. Record device, browser/runtime/model revisions, context/output sizes, and concurrent workload. Run serially, with at least 30 warm observations spanning single-task and six-lesson scenarios before a latency claim. Use medians and p95 plus failures; do not compare isolated timings taken under different background loads.

Measure cancellation, cache reuse, reopening without model load, and memory recovery as observed behavior. Browser memory telemetry can be incomplete; state its limits. A slow input must not trigger unlimited automatic retries.

## 13. Required engineering tests

### 13.1 Domain and synchronization

- Reference integrity and invalid source-revision detection.
- Exact quote ambiguity, multilingual spans, and scoped quantity/date premises.
- Ratio parameter change propagates only supported dependencies; unsupported prose loses review status.
- Semantic change invalidates answer/rubric and cannot partially apply.
- Stale model result and stale diff preview rejected after a teacher edit.
- Stable projected identities across insert/reorder.
- Local overrides survive shared changes; conflicts and orphaned edits remain recoverable.
- Undo/redo does not erase unrelated later work.
- No audience leaks through local overrides, notes, hidden data, or packages.

### 13.2 Persistence and job recovery

- Refresh/reopen preserves canonical content, teacher edits, sources, and current location.
- Storage failure/quota error never displays false saved state.
- Corrupted/oversized/path-traversal archive rejected without damaging an open project.
- Schema migration preserves the original and works transactionally.
- Second-tab writer conflict cannot overwrite newer project data.
- Cancel before load, during generation, after response, and before commit.
- Interrupted job resumes unfinished scope only; late results cannot revive cancelled work.

### 13.3 End-to-end and output checks

Use small deterministic fixtures for UI/editor regression and real local inference for model capability. Label these modes distinctly; a mock is not a Scion test. Do not create tests that only confirm implementation-specific strings exist.

One complete vertical-slice scenario must: import sources, generate a real task, edit a shared premise, preserve a local slide/note customization when those views exist, revise semantically, save/reopen, export student/teacher files, and inspect the final artifacts. Add meaningful negative cases rather than rerunning every heavy check for every cosmetic change.

Run focused tests during implementation. At milestone integration, run typecheck, lint, relevant/full unit suites, build, end-to-end workflows, and actual artifact review. Repeat passed heavy checks only after a relevant change, failure, or new risk.

## 14. Migration and reuse strategy

### 14.1 Donor code to inspect, not wholesale copy

In the old repository:

- `src/lib/courseBlueprintCompiler.js`, `src/hooks/useGeneration.js`, `src/hooks/useDeliverables.js`: understand legacy behavior and failures; do not transplant orchestration.
- `src/studio/RichTextEditor.tsx`, `src/studio/richText.ts`, material-specific components: evaluate mature editing affordances behind new bindings.
- `src/components/deliverables/SlideDecksView.jsx`: inspect slide interactions and teacher customizations.
- `src/lib/exporters/*`, `src/lib/lightweightXlsx.js`, `src/lib/packageZipExporter.js`: harvest tested format/layout capabilities through semantic-document adapters.
- Scion runtime/manifests and `src/lib/scion*.js`: identify the minimal verified runtime path; do not copy 51 files by default.
- `src/studio/storage.ts` and project import/save flows: identify legacy schemas and recovery lessons.
- Actual failure artifacts and regression tests: preserve examples of answer drift, audience leaks, source mistakes, and lost edits.

Some donor modules may depend on old mutable structures. Extract a narrow pure utility or write a new adapter; do not introduce a second canonical CourseMap/Blueprint to satisfy an old function signature throughout the new app.

### 14.2 Legacy import

Implement explicitly supported historical project versions with fixtures from actual saved files. Preserve original archives and attachments. Reliably mapped tasks become shared entities with provenance. Unmappable material remains an editable standalone document with a clear local-only boundary; never guess that similar sentences are the same task.

Produce a concise import result describing preserved, mapped, standalone, and unsupported items. Do not make teachers read a technical migration report to open their materials. Keep the detailed report downloadable for diagnosis.

The new app must not promise that the old site can open new project schemas. Provide a retained original backup and ordinary exported documents as the compatibility bridge.

## 15. Implementation milestones and stop conditions

### Milestone A — prove local content generation

Deliver:

- Minimal runnable local harness and verified model configuration.
- Registered 12-input protocol experiment, raw outputs, semantic review, call/timing receipts.
- A finite model/protocol decision and a fresh confirmation plan/result.
- Initial export/UI parity inventory from the old product.

Exit: the proposed feasibility gate is met with no concealed failures, or a concrete documented model/scope decision is required. Do not build ten editors while this question is unresolved.

### Milestone B — one complete teaching workflow

Implement Project/source/task schemas, one command/persistence boundary, Assignment Brief and Rubric projections, minimal homepage/workspace, direct rich editing, local generation, student/teacher DOCX/PDF, save/reopen, and shared parameter revision.

Use at least one quantitative and one non-quantitative task to avoid designing everything around ratios. Demonstrate both an automatic supported calculation update and a semantic change requiring review. Make an ordinary local customization and prove it survives a relevant shared edit.

Exit: real input to usable task to edit/sync to durable save to verified output works. Compare teacher correction effort and failure behavior against the old product on the same input. A clean folder structure is not sufficient.

### Milestone C — complete materials and mature editing

Add course/lesson planning, teaching content beyond tasks, all ten projections, table and slide editing, stable layout customization, history/override resolution, and remaining export formats from the parity matrix. Add additional deterministic operations only when real teaching cases justify them.

Exit: changing shared content updates every applicable view; independent practice remains independent; teacher edits survive; all ten categories have substantive material-specific value.

### Milestone D — complete courses, migration, and release candidate

Run the three six-lesson courses, fresh/reserved evaluations, full format inspections, performance trials, accessibility/keyboard checks, source import edge cases, migration fixtures, and resource/cancel recovery. Fix observed failures, then rerun affected checks.

Exit: no unresolved critical known defects; noncritical limitations are concrete and disclosed. Independent external teacher review and actual learning outcomes are separately labeled if unavailable, not fabricated and not silently conflated with engineering testing.

### Milestone E — controlled replacement and post-deploy verification

Before changing `edutool.dev`, verify the existing hosting arrangement, domain mapping, deployed revision, asset paths, model distribution, and rollback artifact. Build a separate candidate deployment first. Prior user intent supports eventual publishing, but inspect the actual target and complete reviewable work before irreversible replacement; do not change billing or introduce paid services.

After candidate checks, update version, README, changelog, release notes, and verified artifacts together. Push the intended branch, deploy, check the actual domain/build identity, then perform one-browser live generation/edit/sync/save/export smoke flow. A successful git push is not deployment proof.

Keep the previous production deployment recoverable and old project files intact. If live verification fails, fix or roll back; do not tag a release as complete because the local build passed. Choose the final release identifier explicitly and document how it relates to the old v0.20.0 scope.

### Milestone F — later evidence-driven expansion

After repeated real teacher use, consider source research, student-response diagnosis, and model adaptation based on consented, reviewed data. Measure whether the feature reduces correction effort or improves a specific learning workflow. These additions must submit to the existing content/revision boundary, not create new parallel authorities.

## 16. Release checklist and handoff artifacts

The coding task should leave:

- A working application and reproducible lockfile/build instructions.
- `README.md`: actual setup, local model/device requirements, supported formats, data location, backup, and honest limitations.
- `docs/architecture.md`: short description of the implemented boundaries and deviations from this design.
- `docs/export-parity.md`: verified material/format matrix.
- `docs/model-evaluation.md`: configuration, protocols, input identities, raw artifact locations, semantic results, and actual calls/timings.
- `docs/release-verification.md`: complete workflow results, artifact review, production identity, remaining limitations, and rollback method.
- Versioned project schema/migrations and representative test fixtures.
- Concise changelog describing user-visible behavior and material reliability changes.

Keep documentation proportional. Prefer one maintained results table and linked raw evidence to a new long report for every repair. Never commit secrets or private uploaded classroom content; benchmark fixtures must be synthetic, public with appropriate rights, or explicitly authorized.

Release requires functioning behavior, not only these files. Record explicit scope deviations and their approval; this handoff does not authorize silently removing an applicable baseline capability to meet a date. Every advertised format and supported workflow must have actual evidence or be clearly unavailable in the release UI; do not retain dead buttons with optimistic labels.

## 17. Worked example: one task carried through the system

This is a design/test illustration, not an unseen benchmark input.

**Teacher request:** “Create a 50-minute lesson on proportions and evidence limits. Students should calculate the observed completion proportion for South Room and explain why the city-wide proportion cannot be inferred.”

**Source A, fictional:** South Room accepted 40 distinct radios. Sixteen passed inspection by Saturday. Repeat checks do not count as new radios.

**Source B, fictional:** North Room also participates in the city program. Its accepted-radio count and completion results were not provided.

### 17.1 Canonical task content

- Prompt: compute South Room's observed completion proportion by Saturday, show numerator/denominator, and state whether the result establishes the city-wide proportion.
- Requirement R1: identify 16 completed distinct radios out of 40 accepted distinct radios in South Room.
- Requirement R2: show `16/40 = 0.4 = 40%`.
- Requirement R3: explain that North Room's denominator and completed count are missing, so city-wide completion cannot be calculated.
- Answer limitation: 40% describes this observed room/time scope; it is not proof of a program effect or a city-wide result.
- Criterion C1, 2 points: 2 for correct count/population/time identification, 1 for correct values without scope, 0 for an incorrect population or counts.
- Criterion C2, 2 points: 2 for a correct ratio/result, 1 for a correct ratio with arithmetic/conversion error, 0 for an incorrect ratio or unsupported result.
- Criterion C3, 2 points: 2 for identifying the missing North Room counts and limiting the conclusion, 1 for recognizing insufficiency without identifying why, 0 for claiming a city-wide 40% from these sources.
- Misconception: “Both rooms belong to the same program, so the city result is 40%.” Feedback: shared membership does not establish identical results; identify the missing counts before combining populations.
- Transfer practice: a new task supplies complete counts for two rooms and asks for the combined proportion; it has different numbers and its own canonical answer, not the same task with a new title.

Alternative scoring can be appropriate, but the criterion anchors must clearly distinguish actual responses. This example's points are not a universal rubric template.

### 17.2 Material projections

- Lesson Plan sequences a worked example, student calculation, evidence-limit discussion, independent check, and closing synthesis within 50 minutes.
- Assignment presents sources, the three requirements, and space for work, without the answer.
- Rubric exposes criterion evidence to the teacher; a student rubric may describe requirements without revealing the specific answer.
- Slides show a count diagram, prompt, and staged explanation; teacher notes remain separate.
- Study Guide explains population/denominator, includes the complete worked example, then transfer practice before its answer.
- Quiz uses the independent task or another authored check, not a repackaged answer copied from the assignment.

### 17.3 Required change trace

1. Teacher adapts the exercise to 50 accepted South Room radios, keeping 16 completed.
2. The original source remains 40; the adapted example explicitly records its fictional changed premise.
3. The typed answer becomes 32%; bound references update everywhere in one transaction.
4. City-wide uncertainty remains because North Room's data is still missing.
5. A custom local slide note survives. If it states the old denominator independently, a dependency/override conflict appears rather than silently retaining a reviewed claim.
6. Save, close, reopen: the same revision, source lineage, local note, and conflicts remain.
7. Student PDF/DOCX contain the adapted task but no teacher answer metadata. Teacher files contain the current key and rubric.
8. Undo restores the earlier exercise transaction without deleting unrelated later course edits.

This trace is a mandatory regression story because it crosses the boundaries most likely to drift.

## 18. Known uncertainties and how to resolve them

| Uncertainty                                                        | Required evidence/decision                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Exact deployed Scion base, artifact, adapter, and runtime behavior | Inspect manifests/config and run the local harness; record identities               |
| Can the local model produce useful tasks consistently?             | Finite protocol experiment and unseen confirmation; no inference from brand name    |
| Can existing editors be reused without old state coupling?         | One working shared-field/override vertical slice per editor type                    |
| Exact 0.18.7 format and interaction parity                         | UI/code inventory and saved baseline screenshots/fixtures                           |
| Real Office/Google formatting fidelity                             | Render actual files and test live conversion; separate unavailable tooling          |
| Performance on weaker devices                                      | Explicit device test matrix; do not extrapolate from one Mac                        |
| Public model distribution costs/terms                              | Verify artifact license, host policy, and actual network delivery before deployment |
| Quality beyond the tested teaching families                        | New registered inputs and semantic review; no universal claim                       |
| Actual production routing and rollback                             | Inspect deployment configuration and verify the domain/build identity               |

Do not solve uncertainties by quietly adding cloud inference, dropping difficult formats, weakening the benchmark after seeing failures, or requiring the teacher to operate internal source-binding machinery.

## 19. Instructions to the implementing Codex task

1. Read this document, inspect local `AGENTS.md` instructions, confirm the new repository location, and check the old donor checkout when available.
2. Write a short implementation checklist tied to milestones A–E. Do not create another grand redesign document.
3. Start milestone A with real local inference and independent semantic annotations. Keep browser/model concurrency at one.
4. Build milestone B as a complete working application path before expanding materials. Commit coherent, testable increments.
5. When a gate fails, report the exact input, observed failure, likely responsible layer, and next bounded experiment. Do not add a general-purpose repair subsystem by default.
6. Keep the user informed concisely: what now works, what remains unproven, and what the next check will resolve. Avoid long agent narration in the product and in progress updates.
7. Preserve user changes and source files. Do not delete the old repository, bypass stale-write checks, or overwrite unrelated work.
8. Complete implementation and tests for the agreed scope; distinguish local verification, production verification, and independent education review.
9. Before final release, update version/docs, push, verify deployment and the actual live workflow, and record any remaining limitations honestly.

The success criterion is a teacher spending less time repairing and coordinating materials while receiving better teaching content. Simpler code and a cleaner interface support that result; they are not substitutes for it.
