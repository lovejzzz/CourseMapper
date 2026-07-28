# Scion V0.16.95 — Agent Evidence Continuity

## Release decision

Scion's Agent must answer from the same canonical evidence that the package exports, even after Course Map edits and Smart Sync replace a human-facing resource cell.

V0.16.95 is a narrow Agent evidence-continuity release. It does not change course generation, compiler output, model weights, adapter state, source research, evidence admission, readiness scoring, or export format.

## Goal

Keep source-bound Agent answers available after Course Map edits and Smart Sync by reading from the canonical evidence ledger instead of relying on one mutable presentation field.

## Lane

Local Scion Agent evidence retrieval, CourseGraph context plumbing, and post-sync browser acceptance only.

## Production finding

The deployed V0.16.94 acceptance restored the exact Digital Accessibility project, edited Lesson 1, synchronized all nine stale material families, sampled the save state through the post-sync regrade, and returned to a fully green export state. The sync suggestion also became terminal as intended.

The next source-bound Agent question failed twice:

> Which official sources support accessible forms, and how should Lesson 3 evidence inform Lesson 4 testing and remediation?

The Agent returned the generic retry message in under a second. This was deterministic, not a slow or transient provider response.

The physical V0.16.94 ZIP proved the evidence still existed. Its canonical source ledger contained:

- **Accessible forms** — `https://www.w3.org/WAI/tutorials/forms/`
- **Labels** — `https://www.w3.org/WAI/tutorials/forms/labels/`

Both rows retained provider, license, Lesson 3 session reference, concept link, and evidence text. Smart Sync had correctly replaced the Course Map's display citation with classroom-resource guidance, but the Agent source capability read only that mutable display field.

## Root cause

Three data layers had different responsibilities:

1. the Course Map cell presented concise classroom resources;
2. CourseGraph preserved source identity, lesson relationships, concepts, and provenance; and
3. the package exporter normalized CourseGraph into `PACKAGE_MANIFEST.json` and `SOURCE_REPORT.md`.

The Agent incorrectly treated layer 1 as its only evidence source. When Smart Sync made that display field more instructional, the Agent could no longer find a URL and fell through to a model-dependent action route. The authoritative evidence in layers 2 and 3 was never lost.

## Fix

The live CourseGraph now travels through `AppFlow`, `ChatPanel`, and `useChatRouter` into Scion's local answer capabilities.

Assigned-source answers build from the same trusted CourseGraph ledger used by export. They bind rows to a lesson in this order:

1. stable session references such as `s3`;
2. an explicit lesson scope on the ledger row; and
3. exact concept-label coverage for the requested lesson.

Human-facing Course Map citations remain a compatible secondary source. They are no longer the only source truth.

This keeps the boundary conservative. A source elsewhere in the course cannot answer a lesson-specific question simply because it has a URL.

## Regression proof

`src/lib/__tests__/scionLocalAgentAnswer.test.js` reproduces the deployed failure shape:

1. Lesson 3's `supportingResources` contains the post-sync classroom-resource sentence and no URL;
2. CourseGraph retains the official W3C Accessible Forms and Labels rows with `s3` references;
3. the question asks for official accessible-forms sources and the Lesson 3 → Lesson 4 connection;
4. the answer must include both links, their bounded uses, and the remediation handoff; and
5. a null or generic failure cannot pass.

The existing source-answer tests still prove that map-only citation projects work without a CourseGraph.

## Browser release proof

The release is accepted only after a real browser replay:

1. open or resume the exact four-lesson Digital Accessibility project;
2. make a real Course Map edit;
3. synchronize all stale material families;
4. verify the final green package and one ZIP action;
5. ask the exact production-failure question;
6. require both official W3C links and the Lesson 3 → Lesson 4 connection;
7. download and inspect the physical ZIP;
8. reload and Resume the exact project; and
9. confirm the source answer persists without console errors.

## Release Boundary

V0.16.95 changes Agent evidence continuity only. The pinned public Gemma base and inactive adapter are unchanged. No model-quality, teaching-quality, factual-certification, accessibility-certification, instructor, classroom, student-outcome, or paid-model superiority claim is added.
