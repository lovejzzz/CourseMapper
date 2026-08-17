# EDUTOOL v0.18.1 — Publication Refinement

Date: August 17, 2026

Target: v0.18.1

Status: implementation and acceptance checkpoint

## Outcome

v0.18.1 makes the v0.18 teacher-controlled workflow dependable enough to publish. The release does not add another authoring surface. It fixes defects found by exercising the real product at desktop and phone widths: an early chunk reload could lose the brief, an approved build could invalidate its own blueprint, a cumulative exam could be rejected as a duplicate weekly quiz, and two mobile controls could widen the page beyond the viewport.

## Goal

Reach an evidence-backed publication checkpoint in which the teacher’s brief, plan authority, completed assessment package, and smallest supported viewport remain intact through the full browser workflow.

## Lane

This is a bounded reliability and responsive-UX patch. It changes recovery lifetime, approval lineage, quiz/exam validation, and mobile containment without changing model weights, the public provider identity, or the teacher-visible three-step setup.

## Release Boundary

The release may be published after exact-candidate automated gates, local browser acceptance, remote verification, deployment, and a live exact-version re-audit pass. Any material defect discovered after the v0.18.1 candidate is pushed must ship as v0.18.2; the version is never silently reused.

## Publication standard

The release is eligible to ship only when all of these are true:

1. A staged text brief survives a transient lazy-chunk recovery until the project reaches a durable boundary.
2. Teacher approval remains bound to the original instructional plan and Course Map.
3. Build-owned CourseGraph enrichment may produce one exact execution map without granting authority to later teacher edits.
4. Weekly quizzes retain strict lesson coverage and configured question counts; cumulative exams are validated as whole-course assessments with strict point math.
5. The blueprint gate and Project menu remain inside 320 px and 390 px viewports with no document-level horizontal overflow.
6. Desktop, phone, light, dark, setup, blueprint, workspace, Agent, Project, and legal/footer routes remain usable and free of inspected application-console errors.
7. Unit, lint, format, build, bundle, pipeline, release-history, and focused browser gates pass on the exact candidate.
8. The deployed exact version is re-audited before it is called the publication checkpoint.

## Recovery boundary

Setup recovery is intentionally short-lived and stores only the text brief, safe startup action, and attachment names. It does not serialize private attachment bytes. The record remains until either:

- the teacher approves the exact instructional blueprint and package drafting begins; or
- a Course Map-only build finishes.

Returning to the landing page, starting a new project, or dismissing a saved session still clears the record explicitly.

## Approval and execution maps

The approval receipt remains bound to the original plan hash and teacher-reviewed Course Map hash. After a successful approved build, the review records a separate execution-map hash for the exact CourseGraph-enriched map produced by that build. The approval is accepted only for the original map or that one executed map. Any subsequent edit fails the match and requires a refreshed review.

This distinction prevents internal enrichment from impersonating a teacher edit without weakening the stale-approval boundary.

## Assessment validation

Quiz-bank validation separates lesson-scoped items from `kind: "exam"` items:

- weekly quizzes must cover each requested lesson exactly once;
- weekly quizzes must match the configured question count exactly;
- cumulative exams may span or reference several lessons and may use a different question count;
- every assessment still requires valid positive question points and internally consistent totals.

## Viewport behavior

Blueprint lesson cards constrain min-content width, wrap long evidence prose, and keep evidence badges from distorting the grid. At the smallest supported phone width, the Project menu becomes a viewport-aligned sheet; at larger breakpoints it remains anchored to its trigger.

## Proof boundary

This release can prove code behavior, deterministic validation, tested viewport geometry, inspected browser flows, and deployment identity. It does not claim instructor endorsement, universal factual accuracy, accessibility certification, classroom outcomes, or flawless behavior on every browser and device.
