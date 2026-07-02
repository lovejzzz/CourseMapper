# What CourseMapper needs to improve — per Project Prof

_SIMULATED · UNANCHORED · July 2, 2026 · derived from 12 course-mode Prof terms_
_Scope caveat: cs-python (primary) + research-methods gold, single provider
family (gpt-5.4), single-family judges. High-agreement themes are credible;
treat single-arena/single-universe items as leads. Instrument-mode terms are
quarantined and excluded._

## The dashboard Prof produced

| KPI                                | cs-python               | research-methods | Bar      |
| ---------------------------------- | ----------------------- | ---------------- | -------- |
| Adoption teach-as-is               | **3.43** (CI 2.70–4.16) | —                | ≥ 7.0    |
| Adoption rate (≥ classroom-ready)  | **0%**                  | —                | ≥ 80%    |
| Genome-testable coverage           | 0/45                    | 14/75 (**19%**)  | reported |
| Misconception catch (distractors)  | —                       | **9%**           | ≥ 60%    |
| Misconception repair by term end   | —                       | **0%**           | ≥ 70%    |
| Quiz-item giveaways                | 54 of 70                | 55 of 56         | —        |
| Reading-compliance mastery loss    | **36%**                 | 25%              | ≤ 25%    |
| FAQ hit rate (answers real demand) | —                       | **0%**           | ≥ 60%    |
| Rubric strong/weak separation      | —                       | **1 band**       | ≥ 2      |
| Pacing overflow                    | —                       | 12 of 14 lessons | 0        |

The grader says 99/A. Every number above is a way the package fails to _teach_
that the grader can't see. Two of them are defects the grader **structurally
cannot** catch — they lead the list.

---

## P0 — the two the grader is blind to (fix first)

### 1. Broken promise: "autograded quizzes" → essays with no autograding scheme

**Agreement: 5 universes across 2 arenas (adoption + department).** The course
brief asks for _weekly autograded quizzes_. The package ships short-answer and
essay items with no scoring model. Verbatim persona quotes:

> "The requested course was to have weekly autograded quizzes, and this is an
> essay question with no plausible autograding scheme." (Q6, Essay, 8 pts)
> "This is not an autogradable quiz specification; it reads like a generic
> short-essay rubric and gives me no measurable scoring rule." (A1.1)

This is a **contract violation** — the product promised X and built Y — and it
is structurally valid, so the deep grader passes it. **Fix:** when the brief
(or config) specifies autograded assessment, the quiz compiler must emit
machine-scorable items (MC/exact-match/numeric) with an explicit key, and the
honesty gate should flag essay items sitting under an "autograded" label.

### 2. A genuinely false statement is taught as fact

**Agreement: 1 universe, but a hard correctness error, not an opinion.**

> "In Python, saying assignment 'copies the value' is at best misleading and
> often false for object references; I would not teach it this way."
> (Prerequisite primer — Variables and assignment)

The genome prerequisite primer states something technically wrong. This is a
**content-correctness** bug, not a style issue — a professor who spots one
false claim distrusts the whole package. **Fix:** audit the genome kernels'
prerequisite primers for correctness (this one: assignment binds a _name_ to an
object; it copies the reference, not "the value"); add a factual-claims review
pass to the genome contribution gate.

---

## P1 — the teachability gap, now with agreement scores

### 3. Objective↔assessment alignment is broken (25 findings, P0×8, 3-universe)

The stated learning outcomes are almost entirely recall verbs
("Identify/Define/Explain/Describe") for a _coding_ course, and the competency
map's Bloom span **contradicts** the outcomes it was generated from:

> "For a college CS1 with Python, these outcomes are almost entirely
> recall/explanation and do not state the coding performances I can validly
> assess."
> "The competency map claims a Bloom span of Apply–Analyze, but the lesson plan
> uses Remember through Create, so the stated span is inconsistent across
> documents."
> **Fix:** derive outcome verbs from the _artifact_ the lesson produces (a coding
> lab ⇒ "write/debug", not "identify"); reconcile the competency-map Bloom span
> against the actual lesson-plan verbs at compile time.

### 4. Templated prose — the known #1, now confirmed at 4-universe agreement

27 findings; the highest-agreement P0s are naked template leakage:

> "Then name the quality cue students should carry into Weekly autograded the
> Week 1 quiz." (broken template seam)
> "The lesson plan repeats the lesson title instead of natural instructional
> language."
> This is the grounding roadmap ([[compiler-deep-audit]], items #1–5,
> #15/#16). Prof confirms it's the dominant adoption blocker and adds a
> **seam-corruption** class ("Weekly autograded the Week 1 quiz") distinct from
> plain templating.

### 5. Misconceptions: the genome knows them, the quizzes don't use them

9% of genome-covered items carry a distractor that catches the documented
misconception; 0% of seeded misconceptions get repaired by term end (template
explanations never clear the feedback gate). **Fix:** the quiz compiler should
build at least one distractor per item _from the concept's genome
misconception_, and correct-answer explanations must directly confront it
(the v0.15.187 grounded-explanation work, extended to name the misconception).

### 6. Assessments measure attendance, not learning (giveaway items)

54–55 of every ~56–70 quiz items simulate as "giveaways" (difficulty > 0.9) —
a prepared student aces them without discriminating from a weak one. **Fix:**
raise item difficulty by requiring application/transfer stems (tied to #3) and
by using misconception distractors (tied to #5) — the same fix serves both.

### 7. Workload numbers contradict each other (P0×2, department + adoption)

> "The schedule budgets only 3 hours including class time for Week 1, but the
> lesson plan alone is 110 minutes plus 55 minutes homework and a separate
> quiz."
> The stated workload and the actual lesson-plan minutes disagree. **Fix:** the
> syllabus workload line should be _computed_ from the lesson-plan + assignment
> durations (Prof's own workload accountant is the reference implementation),
> not stated independently.

### 8. Rubrics don't discriminate (1 band, needed 2; TA needed 2 missing criteria)

The TA persona, grading strong vs. weak submissions with only the rubric,
separated them by one band and needed two criteria the rubric lacked. **Fix:**
rubric bands need observable, level-distinct descriptors; add the criteria the
TA reached for (Prof logs which).

### 9. The FAQ answers guesses, not demand (hit rate 0)

None of the questions the simulated cohort actually asked were answered by the
generated FAQ. **Fix:** this is the confusion-heatmap → FAQ pipeline the design
anticipated; ground FAQ generation in the per-lesson misconceptions and the
concepts students are most likely to stumble on, not supply-side topic guesses.

### 10. Lesson plans have no path for non-readers (compliance fragility 36%)

When a realistic fraction of the cohort skips the reading, mastery drops 36%
because the in-class plan assumes everyone read. **Fix:** every lesson plan
needs an in-class exposure path (a worked example, a live demo) that re-teaches
the core concept for students who arrived cold.

## P2 — professional-credibility long tail (16 findings, department only)

- **Accessibility:** no accommodation policy tied to the midterm/final; deck
  "alt-text" is only a cue in the text, not applied object alt-text.
- **Schedule/date arithmetic:** "Important Dates" section has no dates; Lesson 1
  references "Last time…" though it's the first lesson; grading table lists
  components the weekly schedule omits.
- **Cross-references:** malformed "Connection to Next Lesson" that doesn't
  resolve to Lesson 2.

---

## How this maps to what to actually do

| Priority  | Theme                                       | New vs. known             | Effort                                     |
| --------- | ------------------------------------------- | ------------------------- | ------------------------------------------ |
| P0-1      | Autograded-quiz contract                    | **NEW** (grader-blind)    | Small — a compiler guard + honesty gate    |
| P0-2      | False Python primer                         | **NEW** (correctness)     | Small — genome kernel audit                |
| P1-3      | Objective↔assessment alignment              | Sharpened                 | Medium — verb derivation + Bloom reconcile |
| P1-4      | Templated prose                             | Known (grounding roadmap) | Large — the standing lane                  |
| P1-5,6    | Misconception distractors + harder items    | Partly known              | Medium — quiz compiler                     |
| P1-7      | Workload self-consistency                   | **NEW**                   | Small — compute the syllabus line          |
| P1-8,9,10 | Rubric bands / FAQ demand / non-reader path | **NEW**                   | Medium each                                |
| P2        | Accessibility, dates, cross-refs            | **NEW**                   | Small each, many of them                   |

**The headline:** the grounding work you already have queued is correctly the
biggest lever (themes 3–6 all trace to it). But Prof found **five new
grader-blind defects** — the autograded-quiz contract break and the workload
contradiction are cheap, high-credibility wins that would move an adopter's
trust immediately; the false Python primer is a correctness bug worth fixing
before any beta instructor sees it.
