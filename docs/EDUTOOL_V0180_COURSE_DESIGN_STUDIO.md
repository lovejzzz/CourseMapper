# EDUTOOL v0.18.0 — Course Design Studio

Status: locally verified predeploy candidate
Target release: v0.18.0
Decision owner: EDUTOOL
Last updated: 2026-08-17

## Product decision

v0.18.0 changes EDUTOOL from a package generator with an advisory agent into a teacher-controlled course-design system.

The release is successful when an instructor can give Scion incomplete course material, inspect the instructional plan that Scion intends to execute, approve or revise that plan, delegate bounded changes, inspect every proposed mutation, and export a verified package without losing provenance or control.

This is a major-version checkpoint within the pre-1.0 product because it changes the workflow contract. Drafting no longer begins merely because a course map exists. It begins only after an instructor has seen and approved a receipt-bound instructional blueprint.

## Goal

Make EDUTOOL a teacher-controlled course-design studio in which Scion plans before drafting, meaning-changing work is inspectable and reversible, and no polished package can bypass the instructor's exact plan authority.

## Lanes

- **Lane A — Plan governance:** project the instructional-intent graph into a compact teacher review and bind approval to exact plan and Course Map hashes.
- **Lane B — Bounded Agent action:** converge meaning-changing proposals on preview, approval, execution confirmation, relevant verification, and undo.
- **Lane C — Local execution control:** make model preparation cancellable, resumable, and consistently represented across the workspace.
- **Lane D — Release truth:** preserve regression, bundle, pipeline, browser, persistence, and claim-boundary evidence without converting automated conformance into a teaching-quality claim.

## Release Boundary

v0.18.0 proves the workflow and authority boundary: review before drafting, matching approval at every generation entry point, bounded mutation metadata, and genuine cancellation/retry of browser-local model preparation. It does not claim universal factual correctness, instructor endorsement, accessibility certification, production deployment, or improved classroom outcomes.

## Why now

The repository already has the hard internal foundations:

- a Course Graph and compact blueprint as structured sources of truth;
- a pre-draft instructional-intent graph with hashed lineage;
- evidence acquisition and claim admission before semantic drafting;
- a deterministic compiler, repair passes, export verification, and an honest package grade;
- Agent proposal cards, localized diffs, Smart Sync, and one-step undo.

The missing product layer is governance. The internal plan is constructed and checked, but the instructor does not receive a first-class approval moment before full-package drafting starts. The Agent can already preview many changes, but its capabilities are presented as individual tools rather than one legible action loop.

Current model development reinforces this direction:

- frontier systems are improving most rapidly at planned tool use and longer delegated work, not merely at longer prose;
- Gemma 4 exposes structured function calling suitable for the local lane;
- current education products increasingly use standards, competency progressions, diagnostics, and explicit learning-outcome measurement;
- teacher-facing systems are being evaluated for pedagogical rigor and classroom usability, not only response preference.

References:

- OpenAI, “How agents are transforming work”: https://openai.com/index/how-agents-are-transforming-work/
- OpenAI, “New tools for understanding AI and learning outcomes”: https://openai.com/index/understanding-ai-and-learning-outcomes/
- Anthropic, “Introducing Claude for Teachers”: https://www.anthropic.com/news/claude-for-teachers
- Google, “Gemma 4 function calling”: https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4
- Google, “Gemini study notebooks”: https://blog.google/innovation-and-ai/products/gemini-app/gemini-study-notebooks/

## Design principles

1. **Plan before prose.** The instructional blueprint is inspectable before lesson and package drafting.
2. **Teacher authority is explicit.** Approval authorizes execution of a bounded plan; it does not certify facts, sources, accessibility, or classroom outcomes.
3. **Actions are reversible.** Mutating Agent work follows Ask → Plan → Preview → Apply → Verify → Explain, with undo.
4. **Evidence stays attached.** Every important plan, source, mutation, verification, and export transition keeps machine-readable lineage.
5. **Local remains the default.** Cloud models are optional task specialists, not the hidden owner of the whole course.
6. **Measure retained value.** Teacher acceptance and real revision behavior matter more than maximizing an internal synthetic score.
7. **Minimal surfaces.** v0.18.0 adds one blueprint decision surface and strengthens the existing Agent and review surfaces; it does not add a dashboard maze.

## User workflow

### 1. Brief

The instructor provides a description, syllabus, readings, policies, or other source material and chooses output scope.

### 2. Map

Scion creates the editable Course Map. Existing source-order, lesson-identity, and instructional-plan contracts remain authoritative.

### 3. Blueprint review — new release gate

EDUTOOL pauses package drafting and presents a compact instructional blueprint containing:

- course identity and intended progression;
- each lesson’s purpose and focus concepts;
- observable learner action;
- expected evidence artifact and success criteria;
- evidence status and publication boundary;
- assumptions and essential instructor questions;
- the exact plan receipt that approval will bind.

The instructor may edit the Course Map and refresh the blueprint, or approve the current blueprint. Any relevant Course Map edit invalidates the prior approval.

Approval means: “Use this plan as the bounded drafting authority.” It does not mean: “Every factual claim and source is certified.” Evidence acquisition and admission still run after approval where needed.

### 4. Build

Only an approval that matches the current plan receipt may start enrichment and package compilation. Existing evidence, compiler, verification, grading, and export gates remain in force.

### 5. Agent loop

The Agent operates through a common action envelope:

1. Ask: understand the teacher’s intent and current workspace.
2. Plan: name the proposed actions, scope, dependencies, and risk.
3. Preview: show exact before/after changes and affected materials.
4. Apply: execute only the approved mutation.
5. Verify: rerun the relevant alignment, readiness, and export checks.
6. Explain: report what changed, what remains uncertain, and how to undo.

Read-only actions may execute immediately. Local deterministic repairs may execute immediately only when they cannot change instructional meaning. Meaning-changing edits require approval.

## State model

The v0.18.0 build machine is:

`Map → Plan → Enrich → Compile → Verify → Grade`

The Plan stage has four states:

- `preparing`: Scion is projecting the current Course Map into the instructional plan.
- `needs-input`: an essential instructor decision prevents approval.
- `awaiting-approval`: the plan is coherent and waiting for the teacher.
- `approved`: a hash-bound approval matches the current plan and Course Map.

An edit that changes plan inputs transitions `approved → preparing` and prevents package drafting until the refreshed plan is approved.

## Data contracts

### Instructional blueprint review

The public review is a compact projection of the existing instructional-intent graph. It carries:

- protocol and schema version;
- course title and lesson count;
- plan status and evidence status;
- plan receipt SHA-256;
- Course Map input SHA-256;
- lesson review rows;
- essential questions and visible assumptions;
- a claim boundary explaining what the review does and does not prove.

It must not contain hidden chain-of-thought, provider secrets, API keys, or unbounded source text.

### Instructor approval receipt

The approval receipt carries:

- protocol and schema version;
- status `approved`;
- the exact plan receipt SHA-256;
- the exact Course Map SHA-256;
- approval timestamp;
- an explicit authorization boundary.

Approval matching is deterministic. A stale or malformed receipt cannot authorize drafting.

### Agent action envelope

All mutating actions converge on:

- action ID and action kind;
- target entities and affected deliverables;
- safety mode (`read-only`, `safe-local`, `needs-approval`);
- before/after preview;
- plan and source receipts used;
- execution result;
- verification result;
- undo snapshot ID.

The existing proposal, Smart Sync, and undo implementations should be adapted to this envelope rather than replaced.

## Model routing

v0.18.0 keeps one model-neutral tool schema and routes by task:

- **Scion Local:** extraction, grounded Q&A, routine localized transformation, and private/offline use.
- **Deterministic compiler:** structure, alignment, package construction, repair, and verification.
- **Optional BYOK specialist:** difficult planning alternatives, evidence conflicts, critique, or a bounded repair that has demonstrated measurable benefit.
- **Optional second-model review:** high-risk or low-confidence decisions only.

The interface must disclose the route, the reason for external processing, what data leaves the device, and measured cost. Model routing must never silently weaken source or approval gates.

Gemma 4 E4B/12B is an experiment lane, not the v0.18.0 default. Promotion requires browser memory, download, latency, failure-recovery, and matched-quality evidence on supported devices.

## Evaluation

### Release gates

v0.18.0 retains structural and export regressions and adds:

- blueprint review projection tests;
- approval receipt tamper and staleness tests;
- Course Map edit invalidation tests;
- no-drafting-before-approval integration tests;
- resumed-project approval-lineage tests;
- Agent action-envelope and undo tests;
- keyboard, mobile, reduced-motion, and screen-reader checks for the new gate.

### Product outcome measures

Internal grades remain diagnostic. The product should additionally measure, locally by default:

- time to an approved blueprint;
- questions asked before approval;
- percentage of generated material retained;
- teacher edit distance by artifact family;
- accepted and rejected sources;
- alignment gaps caught before export;
- time to verified export;
- after-teaching usefulness and revision notes.

Any aggregate telemetry is opt-in, minimized, and documented. Classroom outcome claims require real classroom evidence.

## Scope by release slice

### v0.18.0 required

- visible Blueprint Review Gate before full-package drafting;
- hash-bound approval with stale-approval invalidation;
- `Plan` in the living build machine;
- existing Agent mutations expressed through the bounded action loop;
- route/privacy explanation for any external specialist call;
- focused accessibility, persistence, and regression evidence;
- updated product copy, changelog, and release receipts.

### Candidate follow-ups

- standards and competency packs;
- teacher-owned diagnostic and mastery maps;
- multimodal evidence ingestion with page/time anchors;
- optional frontier critic routing with measured uplift;
- LMS interoperability and classroom feedback capture.

## Non-goals

- a general autonomous agent that can rewrite the whole workspace without approval;
- a student answer bot;
- default replacement of the local model with a larger download;
- training or activating a new adapter without qualified teacher preference evidence;
- declaring factual, accessibility, or classroom certification from automated scores;
- adding multiple new dashboards or duplicating the existing review queue.

## Acceptance criteria

v0.18.0 is release-ready only when all of the following are true:

1. A fresh full-package request stops after Course Map construction and shows the Blueprint Review Gate.
2. No deliverable-generation request begins until an approval receipt matches both the current plan and Course Map.
3. The review makes lesson purpose, learner action, expected evidence, source status, assumptions, and essential questions inspectable.
4. Editing a plan-relevant Course Map value invalidates approval and requires a refreshed review.
5. Approval survives a safe project save/restore with its receipt lineage intact; stale approval does not.
6. The Agent shows action scope and before/after changes before meaning-changing mutations, then verifies and offers undo.
7. Local generation remains usable without a paid key, and external routes remain explicit.
8. The complete focused suite, production build, bundle gate, pipeline audit, and representative browser run pass.
9. The release documentation clearly separates automated engineering evidence from instructor approval and classroom outcomes.

## First implementation decision

The first vertical slice surfaces the existing pre-draft instructional-intent graph as a compact Blueprint Review Gate, binds approval to its exact receipt and Course Map input, and pauses the existing `onGenerate` workflow between map construction and deliverable generation. This proves the new product contract with minimal duplication. Subsequent work adapts the already-shipped proposal, Smart Sync, and undo capabilities into the common Agent action envelope.

## Implementation checkpoint — August 17, 2026

The first vertical slice is implemented:

- fresh full-package generation pauses at an instructor-visible Blueprint Review Gate;
- approval is bound to the exact instructional-plan receipt and current Course Map hash;
- every deliverable-generation entry point enforces the same approval boundary;
- a Course Map edit revokes stale authority and refreshes the blueprint;
- project snapshots preserve review and approval lineage;
- the living build machine includes the Plan stage;
- Agent proposal changes carry a bounded action envelope with targets, preview, approval mode, executor confirmation, semantic-check boundary, and undo availability;
- blueprint orchestration and Agent feature generation live in small route chunks, preserving the existing workspace bundle limit.
- Stop now reaches an active browser-local model transfer, returns the runtime and all workspace surfaces to an honest paused state, preserves resumable cache data, and retries the same course request when cancellation happened before the first generated token.

Verification at this checkpoint:

- 7,307 unit and contract tests are in the release battery; 162 are intentionally skipped;
- lint and repository-wide formatting checks passed;
- production build and bundle-budget ratchets passed;
- hybrid pipeline and release-history audits passed;
- a real local browser run showed the gate before drafting, withheld Export, accepted approval, and transitioned into lesson-knowledge construction;
- a separate clean-origin browser run stopped a live Gemma transfer, held the paused state without further progress, restarted the same brief, and stopped cleanly a second time.

The prior repeated autosave warning remains documented as a long-lived development-origin observation after restoring a very large historical project. It did not reproduce on the clean acceptance origin. The product already routes oversized exact snapshots through serialized IndexedDB writes with retry, stale-attempt suppression, a compact resume marker, and a course-map-only final recovery belt. v0.18.0 therefore makes no claim that browser storage is unlimited; it claims that blueprint governance is serializable, oversized projects have explicit recovery tiers, and a confirmed current failure remains visible rather than being hidden.
