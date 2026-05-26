# CourseMapper Roadmap

## Product Direction

CourseMapper is moving toward a "consider it done" course-production agent. The user should describe the course, choose scope/materials, and receive a finished draft package. The agent owns generation, QA, repair, alignment, and export readiness. Human involvement should be final approval only, not QA labor.

## v0.7 - God-Mode Delivery Release

Goal: make the website feel like an autonomous course package producer, not a prompt-and-review tool.

1. One primary course-package flow: describe the course, choose scope, generate, receive package.
2. Agent-owned quality loop after generation: completeness check, readiness check, cross-deliverable validation, safe repair, recheck.
3. Safe auto-repair before presentation: missing metadata, inconsistent quiz points, unsupported FAQ categories, short slide notes, rubric coverage, publishability placeholders.
4. Targeted retry without asking: regenerate only weak lessons or deliverable sections when validation identifies local failure.
5. Final "Done Package" handoff: generated materials, agent fixes, remaining assumptions, and export actions in one simple view.
6. Internal scores hidden by default: user sees confidence states like Excellent, Good with assumptions, Needs attention.
7. Model auto-routing: use cost-efficient models first and escalate only after failed quality/repair passes.
8. Export auto-test: verify ZIP/PPTX/DOCX/CSV paths before claiming the package is ready.
9. No fake chat labor: background agent work must not appear as user-authored prompts.
10. Simpler UI: fewer expert controls in the main path; advanced controls remain available but out of the way.

## v0.8 - Autonomous Classroom Package Release

Goal: make CourseMapper credible for real classroom pilots while keeping the agent in charge.

1. Institution profile memory for school policies, grading language, accessibility defaults, AI policy, and course logistics.
2. Agent-filled classroom policies using the institution profile and safe defaults.
3. Reading and citation agent that finds, cites, and formats readings instead of emitting vague reading lists.
4. Canvas-oriented LMS package structure: modules, pages, assignments, quizzes, rubrics, and files.
5. Full-course consistency agent across syllabus, assignments, rubrics, quizzes, slides, study guides, and FAQ.
6. Multi-pass autonomous improvement runs until target quality is reached or a true blocker remains.
7. Finished package report: generated, repaired, verified, assumptions.
8. Minimal escalation: ask only for official dates, official policies, copyrighted readings, or instructor-specific constraints.
9. Versioned package handoff so users can recover prior generated packages.
10. Public demo packages showing polished complete outputs across multiple subjects.

## Perfect System Gap

Goal: close the gap between the current audited v0.8 hybrid compiler and a near-perfect course artifact system.

1. Compile nearly everything. All audited v0.8 package deliverables now compile from the course blueprint; the next cost frontier is optional enrichment, custom deliverables, image generation, and adaptive repairs.
2. Real quality proof, not just validators. Compare generated packages against expert-reviewed gold samples and real instructor edits, not only structure, readiness, heuristics, sparse inputs, and regressions.
3. A true enrichment pass. Use one compact model call to enrich the course blueprint once, then compile everything from that richer course-specific representation.
4. Learning from edits. Learn repeated user preferences for rubrics, slide wording, quiz difficulty, lesson-plan pacing, and apply them automatically on later runs.
5. Adaptive generation. Choose the cheapest safe path per course: deterministic compile, enriched compile, local repair, or model generation only when needed.
6. Better user trust. Show what was compiled, what was model-generated, what was repaired, what quality gates passed, and where human review is still recommended.
7. Broader edge-case coverage. Handle unusual formats, nontraditional courses, labs, clinical placements, studio courses, multi-section syllabi, and messy imported documents.

Hourly execution rule: pick one small vertical slice from this section per run, implement it, run the narrowest meaningful verification, and update roadmap notes or audit evidence before moving to the next slice.

Latest slice evidence:

- 2026-05-26: `audit:pipeline` now emits a per-case feature source matrix in `verification-output/hybrid-pipeline-audit/latest.md`, explicitly naming compiled versus still model-generated deliverables for each audited release fixture.
- 2026-05-26: Discussion Prompts moved onto the deterministic blueprint compiler path; `audit:pipeline` now reports 8 compiled deliverables and only `lessonPlans` remaining on the model path (156 baseline calls -> 18 hybrid calls, 88.5% saved). Remaining warning: compiled discussions still repeat boilerplate across fixtures, so the next slice should make their lesson-specific guidance more varied.
- 2026-05-26: Compiled Discussion Prompts now vary follow-up probes, facilitation guidance, response stems, criteria, and participation guidance by lesson context; scoped `audit:pipeline` rerun (`research-methods`, scope 5) cleared the repeated-boilerplate warning with 0 release warnings and 0 stress findings at the same 33 baseline calls -> 3 hybrid calls cost profile.
- 2026-05-26: Lesson Plans moved onto the deterministic blueprint compiler path with lesson-specific outlines, student-facing summaries, formative checks, UDL notes, and ready-to-teach support. Scoped `audit:pipeline` rerun (`--scopes 5 --no-stress`) now shows all 9 audited deliverables compiled, 33 baseline calls -> 0 hybrid calls, and 0 release warnings in `verification-output/hybrid-pipeline-audit/latest.md`.
- 2026-05-26: `audit:pipeline` now emits a per-case quality gate matrix with validator/readiness pass states plus an explicit human-review recommendation. Scoped rerun (`--scopes 5 --no-stress`) shows all three release fixtures passing validators, quality floor, workspace readiness, and classroom readiness while still recommending a spot-check for institution-specific facts, official dates, and copyrighted readings before handoff.
- 2026-05-26: `audit:pipeline` now emits a Trust Evidence Matrix that pairs repaired course-map field counts, compact repair evidence, delivery path (`compiled` vs `model-generated`), and the handoff review recommendation per release fixture. Scoped rerun (`--scopes 5 --no-stress`) shows all three audited fixtures at `9 compiled / 0 model-generated`, `0` repaired input fields, and the same targeted spot-check recommendation in `verification-output/hybrid-pipeline-audit/latest.md`.
- 2026-05-26: `audit:pipeline` now includes a Stress Case Matrix for atypical course maps, covering sparse assessments plus a messy imported clinical-studio fixture. Scoped rerun (`--scopes 5`) still passes release fixtures at `33 -> 0` calls while exposing one remaining stress warning: compiled slide decks repeat boilerplate across 3 items for the messy-import case, so the next slice should make those edge-case decks more lesson-specific.
- 2026-05-26: Compiled slide decks now vary speaker notes, accessibility guidance, assessment carry-forward cues, and fallback concept selection by lesson context instead of reusing shared boilerplate. Scoped `audit:pipeline` rerun (`--scopes 5`) cleared the slide-deck specificity warning across all three release fixtures plus both stress fixtures, leaving `0` release warnings, `0` stress findings, and the same `33 -> 0` hybrid cost profile in `verification-output/hybrid-pipeline-audit/latest.md`.
- 2026-05-26: The messy-import stress fixture now spans all audited scopes instead of collapsing `8` and `14` down to the same `5`-lesson sample. Full `audit:pipeline --scopes 5,8,14` rerun keeps `0` release warnings and `0` stress findings while the Stress Case Matrix now shows distinct messy-import repair counts at `5`/`8`/`14` lessons (`12`, `18`, `32`) in `verification-output/hybrid-pipeline-audit/latest.md`.
- 2026-05-26: Package handoff receipts now surface shared trust evidence from the same helper logic used by `audit:pipeline`, adding repair evidence plus an explicit human-review recommendation to both embedded and agent-generated quality receipts. Focused coverage passed in `src/lib/__tests__/packageTrust.test.js`, `src/lib/__tests__/packageFinalizerSummary.test.js`, `src/components/chat/__tests__/PackageSummaryCard.test.jsx`, and `scripts/__tests__/hybridPipelineAudit.test.js`; full `npm run audit:pipeline` rerun also passed at `156 -> 0` calls and refreshed `verification-output/hybrid-pipeline-audit/latest.md` with the same `0` release warnings / `0` stress findings baseline.
- 2026-05-26: Live Spanish for Healthcare Professionals ZIP audit passed package readiness (`11/11`, `0` blockers, `0` warnings, export verification passed) at `$0.15 / 24k tokens`, with 9 compiled core deliverables and only the custom Weekly Reflection using model calls. Follow-up fixes should keep custom deliverable names user-facing in receipts/ZIP manifests and make the next cron slices target custom-deliverable cost plus slide-deck phrase polish.
- 2026-05-26: Agent chat history and retry-failure prompts now resolve custom deliverable names instead of leaking internal `custom_*` IDs into serialized agent copy. Focused coverage passed in `src/lib/__tests__/chatHistory.test.js` and `src/components/chat/__tests__/useChatRouter.test.js`; next priority remains reducing custom-deliverable model-call cost for common patterns like Weekly Reflection.

## Current v0.7 Focus

Complete the autonomous package loop in production:

- Built-in finalizer repairs safe issues, reruns readiness, runs export smoke tests, validates course health, and returns a simple confidence state.
- Targeted retry regenerates only localized weak generated sections when the finalizer finds a concrete lesson-level problem.
- Package handoff card shows delivery confidence, safe repairs, export readiness, and remaining assumptions without exposing internal judge scores.
- Agent model routing advice keeps low-cost models first and escalates only after targeted retry cannot clear concrete blockers.
- Main agent starter now supports a single "finish and verify my course package" path while advanced controls remain available.
