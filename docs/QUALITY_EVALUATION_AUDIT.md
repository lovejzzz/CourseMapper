# CourseMapper quality-evaluation audit

Audit date: 2026-07-13

Audited release: v0.16.12 (`20c2f81`)
Verdict: the repository had strong regression and artifact-integrity machinery, but it did not have one valid, interpretable measure of deliverable quality. Several internal pattern scores were presented with more semantic confidence than their evidence supports. Independent review was correctly kept fail-closed, but its instrument and agreement rule were too weak for the claim it was meant to support.

This document records the pre-v1 system. The replacement protocol is in [`QUALITY_BENCHMARK_V1.md`](QUALITY_BENCHMARK_V1.md); the research basis is in [`QUALITY_BENCHMARK_RESEARCH.md`](QUALITY_BENCHMARK_RESEARCH.md).

## Scope and method

The audit traced every quality-producing, quality-reporting, or quality-claiming path found in `package.json`, `src`, `scripts`, `tests`, `evaluation`, `quality-constitution`, release records, retained ZIPs, and product UI. It inspected code, policies, fixtures, retained canary evidence, package manifests, quality reports, generated review forms, and the layered release gate.

The audit distinguishes:

- **deterministic conformance**: reproducible checks over structure, hashes, XML, text patterns, manifests, traces, and logs;
- **semantic judgment**: an interpretation of instructional usefulness, accuracy, alignment, accessibility, or disciplinary authenticity;
- **human evidence**: a bound review made by an identified class of human reviewer;
- **outcome evidence**: observations from actual teaching or learner performance, which the current repository does not contain.

## Complete scoring and claim surface

| Surface                                                                 | What it actually observes                                                                                                               | Current user/release interpretation                     | Audit finding                                                                                                                                                                                                                                                | v1 disposition                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/deliverableQualityScorer.js`                                   | JSON length and keyword counts; optional small-sample model judgment                                                                    | Four 0–10 “quality” dimensions including “QM Alignment” | Invalid as a QM or ready-to-use score; easy to game with length and vocabulary; no factual/source/rendered inspection                                                                                                                                        | Retained as backward-compatible **automated content signals** with a strict claim boundary; removed numeric/QM product claim |
| `QualityBadge` in `SharedComponents.jsx`                                | Displays the above stored values                                                                                                        | Star, `/10`, “Quality Scorecard,” “QM Alignment”        | False precision and unearned rubric authority                                                                                                                                                                                                                | Relabeled “Automated content signals”; bands replace displayed numbers; limits are visible                                   |
| `src/lib/quality/deepQualityGrader.js`                                  | Deterministic defects across Office XML/text, manifest, digest, console, discipline patterns, citations, structure, repetition, texture | 0–100 package grade and letter                          | Excellent regression net, but absence of detected findings is not semantic excellence; fixed penalties and weights are not measurement-calibrated                                                                                                            | Preserved as deterministic conformance evidence; never substitutes for the v1 rubric profile or human review                 |
| `finalizeQualityGate.js`, `packageZipExporter.js`, `releaseManifest.js` | Regrades in-memory package, injects manifest quality, emits `QUALITY_REPORT.md`                                                         | Package quality and readiness                           | Strong cross-surface architecture; grade can still be 99/A while teachability/source truth is unverified                                                                                                                                                     | Preserve; reports must state evidence class, scorer version, scope, and missing evidence                                     |
| `WorkspaceQualityChip.jsx`, `ExportSidePanel.jsx`                       | Displays the deep grader result                                                                                                         | “Deterministic package grade”                           | Wording is materially more honest than the deliverable badge                                                                                                                                                                                                 | Preserve deterministic label; keep separate from benchmark readiness                                                         |
| Teacher-ready constitution                                              | Seven fixed package obligations over five fixtures                                                                                      | Fast teacher-ready gate                                 | Useful release contract; title can overstate what internal fixtures prove                                                                                                                                                                                    | Treat as compiler/package contract only                                                                                      |
| Gold sample audit                                                       | Forty internally curated fixtures across six classroom dimensions                                                                       | Broad quality regression                                | High-value regression coverage, not external validation or outcome evidence                                                                                                                                                                                  | Preserve as development evidence                                                                                             |
| Classroom-Ready Rubric v1.0                                             | Internal judge scores 1–4; D7 asks for external review                                                                                  | Professional/classroom-ready verdict                    | Good essential-criterion instinct; weak criterion sampling, one internal “standing judge,” no reliability interval, mixed construct/conformance criteria, and uncalibrated 85% threshold                                                                     | Superseded by evidence-aware rubric v1; keep as historical design input                                                      |
| Professor-adoption scorer                                               | Required-string groups, forbidden patterns, repetition, feature shapes                                                                  | 0–100 professor adoption score                          | Does not measure adoption or professor preference; it measures pattern conformance against public-course fixtures                                                                                                                                            | Retain only as a professor-facing **contract audit**; do not interpret score as adoption likelihood                          |
| Expert review audit                                                     | Hash-bound external-review packets with source, blueprint, assumption, and edit evidence                                                | External expert proof                                   | Strong fail-closed identity and completeness boundary; complex but appropriately refuses templates/model evidence                                                                                                                                            | Preserve and align review fields with v1 evidence states and rubric                                                          |
| Independent instructor benchmark                                        | Two reviews per package, six 1–5 dimensions, would-teach, edit verdict/time, maximum score spread                                       | Release-level independent validation                    | Correctly requires real instructors and hashes; dimension anchors are underspecified, unanimous binary usability discards information, maximum spread is not a reliability statistic, no critical failure caps, no N/A/insufficient evidence, no uncertainty | Upgraded to review schema v2 and v1 rubric; ordinal alpha, agreement rates, coverage, caps, and full profiles                |
| Production canaries                                                     | Hash-retained real provider ZIP/trace/log plus rendered QA metadata                                                                     | Operational production proof                            | Strong operational and artifact evidence; does not prove teaching quality                                                                                                                                                                                    | Preserve as a separate required release tier                                                                                 |
| Layered evaluation system                                               | Contract + independent benchmark + production canary                                                                                    | Release claim status                                    | Correct separation in principle; previously lacked a versioned construct/corpus tier                                                                                                                                                                         | Adds required evidence-aware benchmark tier; release stays red until qualified held-out and independent evidence exists      |
| Scion bakeoffs, contrast matrix, review packet                          | Matched run identity, deterministic diagnostics, blinded A/B packet, human-ingestion rules                                              | Model/pipeline comparison                               | Several strong controls already exist; effect estimates, absolute rubric profiles, uncertainty, cost/latency/failure summary, corpus split governance, and general reusable schema were fragmented                                                           | Reused as design evidence; v1 comparison record supplies the general analysis contract                                       |

## Findings that change the interpretation of current scores

### 1. A 99/A package is not a 99th-percentile teaching package

The retained production-canary policy currently passes 3/3, but the exact packages do not all regrade at 99/A. Under grader v1.10.1, the music-theory and compiler-hardened UX packages regrade at 99/A with zero findings; the earlier UX package remains 89/B with one P1 and one P2 substance finding. During this audit, manifest-only regrading also exposed a context drift: v1.10.0 ignored the extracted `courseName` during discipline checks and falsely treated the real music package as non-music. V1.10.1 uses the manifest course identity as the offline fallback, restoring the exact music canary to 99/A without weakening the non-music contamination gate. These results are valuable evidence about encoded regressions and cross-surface consistency. They are not evidence that 99% of a classroom-quality construct is satisfied, that an instructor would teach the package, or that it is superior to another package. The grader starts each dimension at 100, subtracts fixed penalties for detected patterns, and normalizes declared weights. Its numerical scale is therefore a defect-index transformation, not an empirically anchored quality scale.

### 2. “QM Alignment” was not measured

The deliverable heuristic counted words such as `objective`, `support`, `multiple`, and `peer` in a short serialized sample. It did not inspect all applicable Quality Matters standards, course overview, alignment trace, learner interaction, accessible rendered output, or institutional review context. The UI displayed the result as a star and `/10`. This was the clearest product-level overclaim and is corrected in v1.

### 3. Internal fixtures prove repeatability, not independence

The constitution, gold samples, professor-facing cases, and deterministic canaries are maintained by the same product team and often encode defects already discovered. They are appropriate regression evidence. They cannot create independent instructor validation, prospective classroom validity, or evidence that the rubric generalizes to unknown courses.

### 4. The old independent benchmark discarded useful disagreement

A case passed only if both reviewers independently crossed fixed mean/minimum/edit thresholds and their largest dimension spread was at most 1.5. This loses which criteria produced disagreement, treats ordinal differences as interval quantities without justification, offers no uncertainty, and makes a single low score fully equivalent to a defined critical failure. The v1 instrument preserves every criterion, evidence state, pre-adjudication rating, exact/adjacent agreement, ordinal Krippendorff alpha, and bootstrap interval.

### 5. Different evidence classes were not represented in one score contract

Deterministic, model, internal-agent, professor, expert, and instructor results lived in separate scripts with different scales and language. The repository could state claim boundaries in prose, but it could not mechanically prevent a model or internal judge score from looking like qualified human evidence. The v1 schema makes evidence class and validation tier mandatory and applies claim caps.

## Deliverable inventory

### Built-in deliverables

1. Course Map
2. Syllabus
3. Lesson Plans
4. Slide Decks
5. Assignment Briefs
6. Rubrics
7. Discussion Prompts
8. Quiz and Exam Bank
9. Study Guides
10. Course FAQ

### Deterministic custom-template families

1. Reading Response
2. Reflection Check-in
3. Feedback Form
4. Project Milestone Checklist
5. Lab Report
6. Case Brief
7. Policy Memo Checkpoint
8. Observation Checklist
9. Participation Self-Assessment
10. Capstone Progress Report
11. Problem Set Worksheet

Arbitrary custom deliverables are unbounded. A scorer cannot honestly infer their construct from a name. The v1 `custom-declared` rubric therefore requires purpose, users, decision, construct, fields, success/failure evidence, provenance, safety, accessibility, and cross-artifact relationships before a semantic score is allowed.

### Package-level construct

A complete package adds properties no single artifact has: completeness, navigability, course-identity continuity, objective and assessment traceability, points/schedule/policy agreement, source coverage, rendered accessibility, evidence handoff, and version/hash identity. V1 includes a package rubric plus non-compensable cross-artifact failures.

## Construct map and evidence boundary

| Construct component         | Deterministic evidence can support                                 | Requires semantic or human inspection                                        | Requires classroom outcomes                         |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Instructional alignment     | IDs, link coverage, arithmetic, missing objectives                 | cognitive-demand match, meaningful practice, authenticity                    | whether the sequence produced learning              |
| Accuracy/source fidelity    | hashes, citation shape, identifier resolution, quoted-source match | truth, entailment, disciplinary interpretation, material omissions           | downstream learner misconception/change             |
| Assessment/feedback         | key presence, weights, coverage, prohibited forms                  | construct relevance, plausible distractors, rubric descriptor quality        | score validity, actual reliability, feedback effect |
| Teaching/learning usability | timing sums, required fields, file presence                        | whether a qualified instructor can run it and edit burden                    | observed classroom enactment                        |
| Student clarity/support     | reading structure, links, repeated requirements                    | whether directions and supports are sufficient for target learners           | learner comprehension and help-seeking              |
| Inclusion/accessibility     | machine-testable document semantics and contrast                   | meaningful alternatives, reading order, equivalent construct, representation | experienced access across learner populations       |
| Integrity/safety/rights     | secrets, PII patterns, license metadata, explicit caveats          | proportional safety boundary, permission interpretation, uncertainty honesty | institutional/legal approval where required         |
| Professional craft          | corruption, truncation, repetition, template leaks                 | genre fit, visual hierarchy, editorial quality                               | sustained use preference                            |
| Cross-artifact coherence    | exact names, points, dates, keys, manifest/file identity           | semantic consistency and navigability                                        | course-operation success                            |

## Cross-surface truth contract

For every retained benchmark package, the following identities must be separate and inspectable:

1. source packet hash;
2. generation input and settings hash;
3. model/provider/revision and prompt hash;
4. raw output and package hash;
5. deterministic grader version and result;
6. v1 rubric version and evidence-class-specific scorecard;
7. rendered-QA evidence;
8. human review identity class, timestamp, independence/conflict attestations, and pre-adjudication ratings;
9. comparison trial and blinding map, retained outside reviewer packets;
10. cost, latency, provider calls, retries, and failures.

The UI, ZIP, `PACKAGE_MANIFEST.json`, `QUALITY_REPORT.md`, benchmark report, and release claim must never collapse these into one unlabeled “quality score.”

## Release-readiness conclusion

At audit time, CourseMapper can support these claims:

- deterministic compiler and package contracts pass their declared fixtures;
- retained production canaries support bounded operational and artifact-integrity claims;
- the new v1 benchmark protocol and 13-case corpus pass structural audit, including explicit instruction-context and source-condition coverage.

It cannot yet support these claims:

- independently instructor-validated classroom readiness across the benchmark;
- actual student-learning effectiveness;
- general superiority of one model or provider;
- Quality Matters certification or conformance;
- accessibility, legal, safety, or institutional-policy certification.

Those limitations are expected evidence states, not reasons to insert simulated reviews or optimistic defaults.
