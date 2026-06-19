# Teacher-Ready Package Constitution

## Purpose

This constitution defines the non-negotiable standard for a CourseMapper package
that is ready to hand to an instructor. It is intentionally smaller than the
40-case gold audit. The constitution is the standard; fixtures are probes that
exercise the standard.

The fast proof path should use fixed CourseIR, digest, manifest, and package
fixtures. It should not call a model, chase exact generated prose, or require a
large corpus for every narrow release. The broad 40-case `audit:gold` suite
remains useful as scheduled regression coverage and for large compiler or
generation changes.

## Constitutional Obligations

### C1. Course Identity Coherence

Every package must preserve one clear course identity from request through
manifest, artifacts, quality report, and handoff copy. Lesson titles,
assessments, assets, and support resources must match the declared course
instead of drifting into another discipline, language, or artifact genre.

### C2. Complete Package Structure

Every requested feature must produce a real exported artifact or an explicit
honest exception. `PACKAGE_MANIFEST.json`, `QUALITY_REPORT.md`, manifest file
rows, and physical files must agree. Export verification may not claim success
while files are missing.

### C3. Assessment Coverage

Every course-map assessment must have a dedicated downstream artifact, or the
package must explicitly disclose that it is only covered as an in-class lesson
activity. Exams, projects, assignments, rubrics, quizzes, and discussion work
must not disappear between the course map and export.

### C4. Source And Caveat Honesty

The package must disclose material generation caveats that affect instructor
trust: native-authoring fallback, partial enrichment, template fallback, export
verification failures, retry exhaustion, source-coverage weakness, and scored
quality findings. A green grade may not hide caveats that exist in the run
digest.

### C5. Discipline And Modality Fit

Required assets, examples, activities, and safety language must fit the course
discipline and teaching modality. A non-lab mathematics or economics course
must not require wet-lab materials; a language course must show language
evidence; a clinical or placement course must preserve practice constraints.

### C6. Artifact Substance

Artifacts must be instructor-usable drafts, not title-only files, placeholders,
mail-merge shells, or repeated generic prose. Each exported file should contain
course-specific work products, directions, criteria, examples, or facilitation
support appropriate to its feature.

### C7. Clear Handoff

The final package handoff must make status, grade, blockers, warnings, caveats,
and next review actions legible. The ZIP, manifest, quality report, and UI copy
should let an instructor or auditor understand what is ready, what is weak, and
what needs human review.

## Fast Gate Policy

`npm run audit:constitution` is the routine fast release gate for constitutional
package safety. It should run against a small canonical fixture set that covers
distinct risk classes:

1. A clean teacher-ready package.
2. A digest caveat that the manifest or report might hide.
3. An assessment that disappears before export.
4. A wrong-discipline asset package.
5. A green handoff that hides low-substance artifacts or review work.

The full `npm run audit:gold` corpus is not the default proof for every patch.
Use it for scheduled broad regression, large compiler or generator changes,
release-candidate hardening, or when a fix changes the meaning of the
constitution itself.

## Machine-Readable Contract

The executable version of this constitution lives at
`quality-constitution/v1.json`. Canonical fixtures live in
`quality-constitution/fixtures/`. The audit script must fail when:

1. A fixture expected to pass violates any constitutional obligation.
2. A fixture expected to fail does not trigger the expected obligation.
3. The constitution file, fixture list, package script, or report output drifts.
