# v0.16.0 "Ready to Teach" — the roadmap

_July 2, 2026. Package is at v0.15.187 (the 0.15.2 slot shipped in the
headless-genome release), so the milestone bump this plan targets is
**v0.16.0**. Goal: a package a real instructor will actually teach from._

Everything in this plan traces to a measured finding — Prof adoption panels
(4 personas × 2 model seats, blind paired twins), the zero-token classroom
simulation, the department review, and the grounded-fraction scans. Nothing
here is speculative polish.

---

## Part 1 — Why the score is low: the diagnosis

**Where we are:** teach-as-is **5.13** on the anchored scale
(5 = "teachable after a full weekend of edits"; 7 = "teachable with light
edits"). Adoption rate still **0%**. The gap to 7+ is, concretely, the
weekend of edits a professor must still do. The residual findings from the
three most recent twin rounds (side B = current compiler, 140 findings) plus
the standing classroom/department KPIs decompose that weekend into seven
root causes, ranked by measured weight:

### RC1 — Assessment content is frame-based, not subject-based (56 residual findings)

The quiz items are now machine-scorable in TYPE, but judges read the content
as evidence-speak: _"this does not define machine-gradable quiz items or
autograded lab checks."_ The compiler's template frames ("Which statement
best explains why X matters for Y?") carry the quiz; the enrichment's SIX
authored, real quiz items per lesson ("What does a Python interpreter do?")
only overlay some slots. Worse, lesson-plan activities assume every
assessment is a written artifact — _"students do not 'draft' an autograded
quiz; the lesson plan is still written for some other assessment genre."_

### RC2 — Templated sameness + coverage bugs that read as sloppiness (43)

Assignments are **3% grounded** (586 sentences — the largest untouched
mass), rubrics 4%, discussions 9%, FAQ 12%. Every lesson's brief reads
identical with nouns swapped. Two verified coverage bugs amplify the
impression: **the Outcome & Assessment Alignment table covers only Lessons
1–10 of 15** (a hard cap — judges: _"the outcome list still ends at 10 while
the course assesses Weeks 11–15"_), and weeks without genome kernels lack
the new Core-ideas line, which judges read as _"uneven proofing."_

### RC3 — Alignment errors a professional catches in seconds (15)

_"If students are expected to 'Define functions,' Bloom should not be
'Remember'; that is a basic alignment error."_ Outcomes use recall verbs for
a coding course; the tables never distinguish what is practiced in lab vs
assessed by quiz; the competency map's Bloom span contradicts the lesson
plans. One wrong Bloom tag destroys trust in every other table.

### RC4 — Reading/source relevance failures (8, high-severity)

_"A DTIC report on visual meta-programming is a poor fit for introductory
Python conditionals and suggests the packet is assembling citations by
keyword."_ The reading engine's keyword matching ships absurd picks; one
absurd reading discredits the whole reading list.

### RC5 — The package doesn't survive simulated students (zero-token classroom)

Misconception repair **0%** (explanations never confront the documented
misconception, so the feedback gate never clears); FAQ answers **0%** of
actual simulated demand; mastery drops **25–36%** when realistic numbers of
students skip the reading (no in-class re-teach path); **12 of 14 lessons**
introduce more new concepts than the median student can absorb; rubric bands
separate strong from weak work by **1 band** (bar: 2).

### RC6 — Professional-credibility tail (16+ department findings)

No real dates anywhere ("Week 1" is not a date); no exam-accommodation
policy tied to the midterm/final; deck alt-text exists as text cues, not
applied object alt-text; "Last time…" references in Lesson 1; malformed
next-lesson cross-references; materials _"too vague for students to know
what to buy, download, or print"_; workload floors unrealistic for
programming courses (_"estimates remain too low for a beginner programming
course with weekly autograded work and labs"_).

### RC7 — The score itself is unproven against reality

One course family deep-tested (cs-python), single provider family judging
(gpt-5.4 seats only), and **zero human anchor rounds** — every number above
is stamped SIMULATED · UNANCHORED. "Ready for real teaching" cannot be
declared by a simulation that has never been calibrated against a real
instructor.

---

## Part 2 — The bar: "ready for real teaching," defined

v0.16.0 ships when ALL of these hold. Each has an instrument that already
exists; no new machinery is required to gate the release.

| #   | Metric                                       | Now      | Exit bar                                         | Instrument            |
| --- | -------------------------------------------- | -------- | ------------------------------------------------ | --------------------- |
| 1   | Teach-as-is (paired mean)                    | 5.13     | **≥ 7.0** on 2 disciplines                       | Prof a1twin / a1      |
| 2   | Adoption rate (≥ classroom-ready tier)       | 0%       | **≥ 50%**                                        | Prof a1               |
| 3   | Residual P0 findings (adoption + department) | ~6/round | **0**                                            | a1 + a4               |
| 4   | Misconception catch (distractors)            | 9%       | **≥ 60%**                                        | a2 zero-token         |
| 5   | Misconception repair by term end             | 0%       | **≥ 70%**                                        | a2 zero-token         |
| 6   | Giveaway items (difficulty > 0.9)            | ~55/56   | **≤ 20%**                                        | a2 psychometrics      |
| 7   | Compliance mastery loss (non-readers)        | 25–36%   | **≤ 25%**                                        | a2 battery            |
| 8   | Pacing overflow lessons                      | 12/14    | **≤ 2**                                          | a2 pacing             |
| 9   | FAQ hit rate (real demand)                   | 0%       | **≥ 60%**                                        | a2mouth heatmap       |
| 10  | Rubric strong/weak separation                | 1 band   | **≥ 2 bands**                                    | a2mouth TA round-trip |
| 11  | Human anchor                                 | none     | **≥ 2 instructors, tier agreement ±1, ANCHORED** | Reality Anchor        |
| 12  | Deep grader + gold audit                     | green    | stays green (regression floor)                   | existing CI           |

---

## Part 3 — The lanes (specific fixes, file-level)

Every compiler-side change is gated by a twin round (same generation, paired
delta CI must exclude 0 or at minimum not regress). Generation-side changes
are gated by generation-A/B (fresh crucible rounds per side, aggregate
protocol). This is the loop that took 2.43 → 5.13; v0.16.0 is that loop run
to the bar.

### Lane A — Assessment authenticity (RC1 + RC3) · the biggest lever

- **A1. Authored-first quiz compilation.** Invert `buildQuizAtomsForLesson`
  (courseBlueprintCompiler.js ~17000): the enrichment's authored
  `quizItems[]` become the PRIMARY item source; template frames fill only
  the remaining slots. Today's overlay direction (template-first,
  enrichment patches) is why real questions drown in evidence-speak.
- **A2. Autograding spec page.** The Quiz & Exam Bank export gains a
  per-quiz scoring block: answer key table, points, scoring rule ("1 correct
  letter = 2 pts, no partial credit"). Kills _"no plausible autograding
  scheme"_ at the document level (docxExporter quiz section).
- **A3. Artifact-genre-aware lesson plans.** The registry `kind` selects the
  activity language: quizzes get PREPARE/retrieval-practice verbs, labs get
  BUILD/debug verbs, written artifacts keep draft/revise. Kills _"students
  draft the Week 1 quiz"_ (modality templates + `buildLessonPlanOutline`).
- **A4. Outcome verbs from artifact genre + Bloom consistency.** A coding
  lab's outcome says write/debug/trace, not identify;
  `bloomLevelFromStemVerb` (exists) applied to OUTCOMES and the alignment
  table at compile, with a consistency check (verb ⇄ Bloom tag ⇄ practiced
  vs assessed columns).
- **A5. Coverage completeness gates.** Fix the verified Lessons-1–10 cap in
  the alignment table (likely a `unique(…, 10)`/slice); compile-time gate:
  every lesson appears in the SLO/alignment surface; every graded week's
  component appears in the weekly schedule (the grading-table ⇄ schedule
  consistency finding).

Measured by: twin (expect the largest single delta of the plan), a2
giveaways (#6), a1/a4 P0 count (#3).

### Lane B — Grounding completion (RC2)

- **B1. Assignments slice** (3% → target ≥20%): steps decompose the authored
  `assignmentCore.taskDescription`; FORMAT REQUIREMENTS render
  `assignmentCore.parameters` (partially routed); success criteria quote
  keyTerm definitions instead of "accurate concept use" boilerplate.
- **B2. Rubrics slice** (4% → ≥20%): band descriptors built from keyTerm
  definition (top band: applies the definition with an example) and the
  documented misconception (low band: shows the misconception) — this is
  also the rubric-discrimination fix (bar #10): bands become observably
  different behaviors, not adverb gradients.
- **B3. Discussions slice** (9% → ≥20%): the authored
  `discussionPrompt.tension` becomes the debate frame; follow-ups from
  kernel facts and misconceptions.
- **B4. Demand-driven FAQ** (hit 0% → ≥60%): compile FAQ entries from the
  misconception library + prerequisite gaps + workload/logistics questions —
  the questions Prof's simulated cohort actually asks (a2mouth heatmap is
  the meter, and its question corpus is the spec).
- **B5. Kernel-coverage evenness.** Weeks without kernels fall back to
  keyConcept-derived core-idea lines so no row looks unproofed; surface
  kernel coverage % in the in-app quality badge.
- **B6. (Generation-side) Enrichment schema extension.** Ask the kernel call
  for: assignment steps, rubric band descriptors, discussion follow-ups,
  per-lesson FAQ entries. Costs tokens (~+10–15%/generation, measured by the
  diet instrumentation); gated by generation-A/B, not twin.

### Lane C — Survive the simulated classroom (RC5)

- **C1. Repair loop.** `quizCorrectExplanation` must quote the
  misconception's corrective ("= binds the name; x = x + 1 is an
  instruction, not an equation") — Prof's feedback gate only clears when the
  explanation confronts the error. Meter: repair 0% → ≥70% (#5).
- **C2. Non-reader path.** Every lesson plan gains an explicit in-class
  re-teach segment (worked example or live demo covering the reading's core
  concept), marked for students who arrived cold. Meter: compliance loss
  (#7).
- **C3. Pacing caps.** Cap new-concepts-per-lesson using genome
  `edges.requires` + intake capacity; overflow concepts move to spiral
  review slots in later lessons. Meter: pacing overflow (#8).
- **C4. Item difficulty.** Application/transfer stems on authored items
  (with A1) so items discriminate. Meter: giveaways (#6).

### Lane D — Source integrity (RC4)

- **D1. Reading relevance gate v2.** Discipline-fit check before a reading
  ships: genome discipline + concept tokens vs source topic; a keyword match
  that fails fit is REPLACED by the discipline's primary open text chapter
  (OpenStax etc.) when one exists, else dropped — never shipped with a
  straight face. Honest labeling for unverified picks ("suggested — verify
  fit"). Meter: reading-relevance findings in a1/a4 → 0.

### Lane E — Professional credibility (RC6)

- **E1. Real dates.** Term-start-date input (one field) → registrar-grade
  date arithmetic for every "Week N", Important Dates, and due windows.
- **E2. Accessibility policy block.** Exam-accommodation language tied to
  the midterm/final rows; testing-accessibility policy in the syllabus.
- **E3. Applied alt text.** PPTX exporter writes actual object alt-text from
  the existing cue text (pptx builder), not just a printed cue line.
- **E4. Cross-reference integrity pass.** No "Last time…" in Lesson 1;
  "Connection to Next Lesson" must resolve to the actual next lesson's
  title; compile-time check.
- **E5. Procurement-grade materials.** Materials lines name the concrete
  tool/version/source ("Python 3.12 + VS Code, free") instead of "course
  materials"; per-discipline workload floors (programming ≥ realistic
  minimums) in `buildWorkloadEstimate`.

### Lane F — Prove it against reality (RC7) · the release gate

- **F1. Breadth.** Run the full loop (crucible → a1twin → a2 → a2mouth → a4)
  on research-methods and one humanities course; bars #1–#10 must hold on
  at least 2 disciplines. (Humanities stays in the lower-confidence lane
  until F2.)
- **F2. Human Reality Anchor.** 2–3 beta instructors review the SAME
  package with `humanAnchorTemplate`; compute sim-to-real agreement
  (tier ±1, teach delta, objection overlap ≥0.3); the ANCHORED stamp
  replaces UNANCHORED in every report. **v0.16.0 does not ship UNANCHORED.**
- **F3. Cross-family judging** when Anthropic/Google keys land (removes the
  single-family caveat); re-run the calibration pair.
- **F4. Protocol discipline** (standing): compiler change → twin;
  generation change → generation-A/B; pool rounds when one N=8 CI spans
  zero; battery + gold + prof unit tests green at every commit; releases via
  main carry the gold-audit slice.

---

## Part 4 — Sequencing, cost, and what to expect

**Phase 1 — compiler-side, twin-gated (Lanes A, B1–B3+B5, C, D1, E).**
All deterministic; each slice ~0.5–2 days of work + ~$0.50–1.50 of twin
measurement. Expected teach-as-is movement based on the measured arc:
Lane A is the largest remaining lever (assessment findings = 56/140
residuals); A+B together are what the tie-judges mean by "substantively
identical." Realistic target after Phase 1: **6.0–6.5**.

**Phase 2 — generation-side, A/B-gated (B4, B6, plus prompt work from A3/A4
if templates alone fall short).** Fresh generations per side (~$3–8 per
comparison). This is where the last point to 7+ likely lives, because
templates can only rearrange authored content — richer authored content per
lesson is the ceiling-raiser.

**Phase 3 — validation (F1–F3).** ~$10–20 of simulation + the human rounds.
The release decision is made here, against the Part-2 table, not by feel.

**Total measurement budget: ~$40–80.** Engineering: Phase 1 is roughly 2–3
weeks of focused work; Phase 2 one week; Phase 3 calendar-gated on human
reviewers.

**Traps carried forward (from the release memories):** exporters must render
every newly-routed field (keyVocabulary shipped invisible for a release);
registry titles are verbatim — never normalize them (honesty gates);
de-templating can trip the boilerplate gate — re-run gold after every slice;
judge-pool variance means only within-pair deltas are comparable across
rounds; the twin measures compiler changes only — generation-side work needs
generation-A/B or it will (wrongly) measure as zero.

---

## Part 5 — Why this plan is credible

The method proposed here is not aspirational — it is the method that already
worked, twice, today:

| Step                                                               | Delta     | CI           | Verdict                              |
| ------------------------------------------------------------------ | --------- | ------------ | ------------------------------------ |
| Four narrow fixes (autograded type, primer, workload, distractors) | −0.13     | −0.66..+0.41 | correctly measured as NOT sufficient |
| Seam-corruption fix                                                | **+2.43** | +1.03..+3.83 | significant                          |
| Grounding slice 1                                                  | **+1.30** | +0.22..+2.39 | significant (23 pooled pairs)        |

2.43 → 5.13 in one day, every step gated. v0.16.0 is the same loop, run
lane by lane, until the Part-2 table is green and two real instructors
agree with the simulation.
