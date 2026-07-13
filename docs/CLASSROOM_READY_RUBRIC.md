# The Classroom-Ready Rubric (CCR) v1.0

> Historical rubric: superseded for current scoring by `evaluation/quality-benchmark/v1/rubric.json` and `docs/QUALITY_BENCHMARK_V1.md`. Keep this document as design history only. Its internal-judge scores and June 2026 baseline must not be presented as independent validation or current v1 evidence.

The judging instrument for CourseMapper output quality. Every release candidate from v0.9.1 onward is scored against this rubric by the standing quality judge (the development agent), using the protocol in §5. The bar is deliberately set at the level of professional university course materials — the package an experienced instructor at a serious institution would put their name on.

## 1. Framework anchoring

This rubric is an _operational adaptation_ — scoring CourseMapper's specific artifact types — of established higher-education quality frameworks:

- **Quality Matters (QM) Higher Education Rubric, 7th Edition** — 8 General Standards, 44 Specific Review Standards, 22 essential; certification requires _all_ essential standards met **plus** ≥85% of total points. CCR borrows this two-part gate (essential criteria + weighted threshold) and QM's alignment doctrine (objectives ↔ assessments ↔ materials ↔ activities). The repo's existing `qmAlignment` score in `deliverableQualityScorer` is a precursor of dimension D1.
- **Constructive alignment (Biggs)** — objectives, activities, and assessments form one chain; anything unaligned is decoration.
- **Haladyna, Downing & Rodriguez's multiple-choice item-writing guidelines** (the canonical research-derived taxonomy) — governs D2's quiz criteria.
- **UDL Guidelines 3.0 (CAST, July 2024)** — engagement / representation / action & expression, with the 3.0 emphasis on learner agency; governs D5. Accessibility criteria additionally reference WCAG 2.1 AA expectations for exported documents.
- **Mayer's multimedia learning principles** (coherence, signaling, segmenting, redundancy) — governs slide design in D4/D6.

## 2. Scoring model

Each criterion is scored on four anchors:

| Score | Anchor           | Meaning                                                                                   |
| ----- | ---------------- | ----------------------------------------------------------------------------------------- |
| 1     | **Unacceptable** | An instructor would be embarrassed; students would be confused or misled                  |
| 2     | **Developing**   | Usable after instructor rework; reads generated                                           |
| 3     | **Professional** | An instructor ships it with only taste edits; indistinguishable from competent human work |
| 4     | **Exemplary**    | Better than the typical instructor-made equivalent; a model of the genre                  |

**Package verdict (QM-style two-part gate):**

- **CLASSROOM-READY**: every essential criterion (marked ★) ≥ 3, weighted total ≥ 85%, **and** D7 external validation satisfied.
- **PROFESSIONAL**: every ★ ≥ 3 and weighted total ≥ 85% (internal judgment only).
- **DEVELOPING**: no ★ below 2 and total ≥ 65%.
- **BLOCKED**: any ★ at 1, or total < 65%.

Dimension weights: D1 ×3, D2 ×3, D3 ×3, D4 ×2, D5 ×2, D6 ×2, D7 gate-only. (Substance, alignment, and assessment integrity dominate — that is what universities certify.)

## 3. The seven dimensions

### D1 — Constructive alignment (QM GS 2 & 3; Biggs) — weight ×3

| #      | Criterion                                                                                                                                              | Notes / automated proxy                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| D1.1 ★ | Course and lesson objectives are specific, **measurable**, written with observable verbs at announced Bloom's levels — no "understand/appreciate/know" | objective verb scan                                    |
| D1.2 ★ | Every objective is assessed somewhere; every assessment maps to a stated objective; the chain is traceable artifact-to-artifact                        | `trace_objective` gap report = 0 unassessed objectives |
| D1.3   | Announced Bloom's level matches the actual cognitive demand of the task (an "Analyze" item requires analysis, not recall)                              | judge reads items against levels                       |
| D1.4   | Materials and activities visibly serve the objectives they are attached to (no orphan readings/activities)                                             |                                                        |

### D2 — Assessment integrity (QM GS 3; Haladyna et al.) — weight ×3

| #      | Criterion                                                                                                                                                                                                    | Notes / automated proxy                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| D2.1 ★ | **Quiz items test the discipline**: stems pose complete, content-bearing problems; correct answers are domain facts/judgments, not course-process descriptions                                               | meta-content detector = 0 process-noun stems              |
| D2.2 ★ | Distractors are plausible **domain misconceptions** — homogeneous in length/grammar/style with the key; no clang associations, no "all/none of the above", single defensible key                             | item-writing checklist pass per sampled item              |
| D2.3 ★ | Rubric level descriptors describe **observable work qualities** that differ by substance (not "some/most/excellent" quantifier ladders); weights sum correctly; criteria match the assignment actually given | weight-sum check; judge reads one rubric против its brief |
| D2.4   | Assessment variety across the course matches the assessment architecture (not one genre stamped per week); points/workload arithmetic is consistent everywhere it appears                                    | workload/points cross-check                               |
| D2.5   | Answer keys, explanations, and scoring guidance would let a TA grade consistently without the author present                                                                                                 |                                                           |

### D3 — Subject-matter substance & truth — weight ×3

| #      | Criterion                                                                                                                                                                                | Notes / automated proxy                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| D3.1 ★ | Key terms are real disciplinary terms with **correct, non-circular definitions** and concrete domain examples (never the lesson title defined by its role in the course)                 | meta-content detector on key terms                      |
| D3.2 ★ | Content claims are factually correct and current for the discipline; the judge spot-verifies a sample per course                                                                         | judge protocol §5                                       |
| D3.3 ★ | Sources are real and verifiable; citations complete and consistently formatted; nothing fabricated; copyrighted/locally-confirmed items flagged honestly                                 | `search_research` verification trail; assumption ledger |
| D3.4   | Discussion prompts pose genuinely debatable disciplinary questions (a defensible position exists on ≥2 sides); assignments operate on real cases/datasets/texts with concrete parameters |                                                         |
| D3.5   | Disciplinary voice: terminology, notation, and genre conventions match the field (a film course sounds like film studies, not generic pedagogy)                                          |                                                         |

### D4 — Instructional design & materials (QM GS 4 & 5; Mayer) — weight ×2

| #      | Criterion                                                                                                                                                                               | Notes                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| D4.1 ★ | Slides teach: assertion titles, evidence-bearing bullets (claims, data, examples), ≤4 bullets/slide, no meta-scaffolding visible to students; speaker notes explain rather than restate | Mayer coherence/signaling |
| D4.2   | Lesson-plan activities are runnable as written: concrete procedure, timing that sums to session length, named materials, realistic grouping                                             | timing-sum check          |
| D4.3   | Study guides function for self-study: a student who missed class could prepare from them alone                                                                                          |
| D4.4   | Scaffolding is real: prerequisite checks, worked examples, and practice progressions contain actual content, not labels                                                                 |

### D5 — Inclusion, support & accessibility (QM GS 7 & 8; UDL 3.0; WCAG 2.1 AA) — weight ×2

| #      | Criterion                                                                                                                                                        | Notes          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D5.1 ★ | Exported documents are accessible: true heading structure, meaningful alt text for images/visuals, no color-only meaning, readable contrast, tables with headers | structure scan |
| D5.2   | UDL options are concrete and course-specific (an actual alternative pathway a student could take), not boilerplate sentences                                     |
| D5.3   | Policies and support sections are complete, current, and written for students (integrity, AI use, accommodations, wellness, support services)                    |
| D5.4   | Language is bias-aware and identity-affirming in examples and scenarios (UDL 3.0 emphasis)                                                                       |

### D6 — Professional craft & format — weight ×2

| #      | Criterion                                                                                                                                       | Notes / automated proxy          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D6.1 ★ | Zero mechanical defects: no template seams, truncations, dangling clauses, duplicated phrases, placeholder text                                 | full v0.8.61+ gate suite = clean |
| D6.2   | Typography and layout read designed: consistent hierarchy, spacing rhythm, cover/TOC where length warrants, branded theme applied               |                                  |
| D6.3   | Repetition discipline: full titles once, working references after; no phrase stamped at template frequency                                      | rendered-text repetition gate    |
| D6.4   | **Blind test**: the judge places the artifact beside a strong instructor-made equivalent; a reviewer should not reliably pick the generated one | §5 protocol                      |
| D6.5   | Localization complete: no "TBD/confirm locally" remnants in a package whose instructor completed the localization flow                          | placeholder scan                 |

### D7 — External validation (gate for CLASSROOM-READY; QM-style review) — gate only

| #      | Criterion                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D7.1 ★ | ≥2 real instructors across ≥2 distinct teaching modalities reviewed full packages of their own real courses at proof scope (5/8/14 lessons) against this rubric |
| D7.2 ★ | Their concrete edit histories show only taste-level changes on D1–D3 surfaces (no correctness or substance rewrites)                                            |
| D7.3 ★ | The repo's expert-review audit reports external proof complete for the current package version                                                                  |

## 4. Per-artifact score sheet

Each judged release produces one scorecard per sampled course:

```
Course: ______  Scope: __ lessons  Version: ____  Date: ____
Artifacts sampled: syllabus + course map + N full lesson packets (all 8 types)

D1 alignment        [D1.1★ _] [D1.2★ _] [D1.3 _] [D1.4 _]   ×3
D2 assessment       [D2.1★ _] [D2.2★ _] [D2.3★ _] [D2.4 _] [D2.5 _]   ×3
D3 substance        [D3.1★ _] [D3.2★ _] [D3.3★ _] [D3.4 _] [D3.5 _]   ×3
D4 instruction      [D4.1★ _] [D4.2 _] [D4.3 _] [D4.4 _]   ×2
D5 inclusion        [D5.1★ _] [D5.2 _] [D5.3 _] [D5.4 _]   ×2
D6 craft            [D6.1★ _] [D6.2 _] [D6.3 _] [D6.4 _] [D6.5 _]   ×2
Essential floor: all ★ ≥ 3?  __    Weighted total: __ / 100  (≥85 required)
Verdict: BLOCKED / DEVELOPING / PROFESSIONAL / CLASSROOM-READY
Top 3 deficiencies with quoted evidence:
1. …
```

## 5. Judge protocol

1. **When:** at every phase exit of the v0.9.1 program, and for any release that touches the compiler, enrichment, or exporters.
2. **Sample:** ≥2 courses from different disciplines (one STEM-adjacent, one humanities/social), full lesson packets for 2 lessons each (all 8 artifact types) + syllabus + course map — read as **rendered exports**, the form students/instructors receive.
3. **Order of evidence:** deterministic gates first (they pre-fill the automated-proxy criteria); then full qualitative read; then spot-verification of ≥5 content claims and ≥3 citations per course (D3.2/D3.3) using `search_research` or direct source checks.
4. **Blind craft test (D6.4):** one generated artifact and one strong human exemplar of the same genre, judged side by side.
5. **Honesty rules:** scores quote evidence verbatim; a criterion without inspected evidence is left unscored, not assumed; the judge's verdict can be BLOCKED even when all automated gates pass — gates are floors, not ceilings. The judge never scores D7; only real instructors can.
6. **Record:** scorecards land in `verification-output/classroom-ready-scorecards/<version>/` and the verdict goes in the release notes.

## 6. Current baseline (judged June 10, 2026, v0.9 output)

Applying §5 to the OUTPUT-V09 four-course package: **D6 = 3** (craft is professional), **D1 ≈ 2–3** (objectives strong, chain partially traceable), **D5 ≈ 2** (structure yes, UDL boilerplate), **D4 ≈ 2** (slides structured but don't teach), **D2 = 1–2** and **D3 = 1** (★ failures: items test course process; key terms are circular). Verdict: **DEVELOPING** — exactly the gap the v0.9.1 program exists to close. The essential criteria that block: D2.1, D2.2, D3.1, D3.2.
