# What CourseMapper needs to improve — per Project Prof

> **Fix log (July 2, 2026):** four findings addressed at the root and shipped
> (commits `8f26c5d`, `f8e705b`), full battery + gold green:
>
> - ✅ **#1 autograded-quiz contract** — autograded quizzes now emit all
>   machine-scorable multiple-choice items; exams keep written items.
> - ✅ **#2 false Python primer** — `cs/variables` kernel corrected to "binds
>   the name to the value (for objects it binds the reference)"; source
>   snapshot kept verbatim.
> - ✅ **#5 misconception distractors** — quiz distractors now lead with the
>   concept's documented genome misconception; proven that Prof's own
>   catch-detector fires on the compiler's output (metric moves on
>   genome-enriched generation).
> - ✅ **#7 workload contradiction** — one `formatWorkloadLine` helper shows
>   the breakdown everywhere so stated == sum-of-visible.
>
> Still open (the grounding lane + medium-effort items): #3 alignment, #4
> templated prose, #6 giveaway items, #8 rubric bands, #9 FAQ demand, #10
> non-reader path, plus the P2 accessibility/dates tail.

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

---

## Measurement round — did teach-as-is move? (July 2, 2026)

A fresh live crucible round generated a cs-python package **with the four fixes
compiled in** (verified in the files: weekly quizzes now 6 MC / 0 essay, midterm
keeps its written items, workload shows its breakdown, the false primer is
gone). A 7-universe Prof adoption round on it, same cast and seed as the
baseline:

|               | Baseline package    | Fixed-compiler package  |
| ------------- | ------------------- | ----------------------- |
| Teach-as-is   | 3.43 (CI 2.70–4.16) | **2.29 (CI 1.59–2.99)** |
| Adoption rate | 0%                  | 0%                      |

**The honest verdict: teach-as-is did NOT move off ~3.** Two reasons, both
important:

1. **The comparison is confounded.** These are two _independent_ generations,
   not a same-generation twin — exactly the confound Prof's own design (the C2
   lesson) warns against. The CIs overlap (2.70–2.99), so by the variance
   protocol the difference is **not significant** in either direction. A fair
   A/B needs the same course map compiled both ways; independent generations
   conflate the fix with model variance.

2. **The fixes were necessary but not sufficient, and Prof showed exactly why.**
   Theme-level, the fixes worked: the **workload contradiction dropped from
   P0×2 to a single subjective P1** ("too optimistic," no longer a hard
   contradiction), and the false primer is gone. But the **autograded theme
   stayed high (18 findings)** because the fix changed the item _type_ while
   the item _content_ is still templated — personas now say _"this is multiple
   choice but not autogradable **as written** … prompt and answer choices are
   tangled with irrelevant course references."_ And "autograded" now surfaces
   in the pre-existing template-seam corruption ("Autograded Autograded
   Autograded the Week 1 quiz" — a finalizer bug, present in the baseline too).

**Conclusion:** teach-as-is is gated by **templated prose / grounding** (the
big lever, still untouched), not by the narrow defects fixed here. Prof
confirmed this rather than letting us assume the cheap fixes would move the
headline — which is the entire point of the instrument. The next real movement
needs the grounding lane (#3, #4, #6) and a same-generation twin protocol to
measure it fairly.

---

## Twin round — the fair measurement (July 2, 2026, later the same day)

The same-generation twin harness now exists (`scripts/prof/twinCompile.mjs` +
`--arena a1twin`): one captured generation (crucible rounds now save
`project.json` on success), compiled by two compiler versions into fixtures
sharing a `generationId` (the arena REFUSES unpaired packages), judged in
blind pairs — same persona/seat/seed reads both packets, A/B→One/Two order
randomized per universe, statistic = CI on the per-universe delta.

First live twin: generation `ae42f9db09e8…`, **A = b11543c (pre-fix compiler)
vs B = HEAD (the four fixes)**, N=8 pairs, $0.40:

|                    | Result                                                         |
| ------------------ | -------------------------------------------------------------- |
| Paired delta (B−A) | **−0.125 (95% CI −0.66 to +0.41)** — no significant difference |
| Record             | 3W–2L–3T                                                       |
| CI width           | **±0.54 at N=8** (the confounded protocol needed ~±1.5)        |

What the pairs showed, verbatim:

- The fixes ARE perceived where a judge hits the fixed surface: _"Packet Two
  converts Packet One's non-autogradable short-answer and essay quiz items
  into multiple-choice items, which is closer to the request"_ (+1, pref B);
  _"Packet Two gives more concrete weekly time accounting"_ (pref B).
- But three judges called the packets _"substantively identical"_ — the
  dominant signal is the shared templated prose, and the loudest visible
  defect on BOTH sides is the pre-existing lesson-plan seam corruption
  (_"Autograded Autograded Autograded the Week 1 quiz"_ — a finalizer bug,
  untouched by the fixes).

**The clean verdict the confounded round couldn't give:** the four fixes are
real but worth ≲1 point to the judges who notice them, and ~0 on net; the
teach-as-is ceiling (~2.7 on this generation) is held down by templated
sameness and the seam-corruption bug. The grounding lane is confirmed as the
only lever that can move the headline — and the twin harness is now the
standing instrument to prove it when it lands (target: paired delta CI
excluding 0).

_Harness caveat logged: the 34k-char packet budget can truncate the two sides
at slightly different points, producing spurious "cuts off mid-sentence"
comparisons (u1/u5). Tie-heavy results are unaffected; alignment of packet
truncation is a small future improvement._

---

## Seam-corruption fix — the first significant movement (July 2, 2026)

The twin round promoted the lesson-plan seam corruption ("Autograded
Autograded Autograded the Week 1 quiz") to the loudest defect in the package.
Probe-bisection traced it to the exact replace: the sanitizer treats
`quiz: <tail>` in prose as an internal-label leak and substitutes the visible
artifact — but the artifact title itself contains `quiz:` (a generation-glued
double title), so every sanitize layer re-matched inside its own insertion
(6,785 duplications in one live compile) and spliced other lessons' artifacts
mid-title.

Fix: two guards in the replacement machinery — a match that is a substring of
its own replacement is the artifact's real name (idempotence), and a label
preceded by a non-determiner word is mid-title (position). Plus a
generation-side belt in the native skeleton prompt: never glue two cadences
into one assessment title.

**Twin verdict (same generation, pre-fix vs fixed, N=8, $0.49):**

|                            | A (pre-fix)              | B (fixed) |
| -------------------------- | ------------------------ | --------- |
| Corruptions in export text | 209 dups + 398 fragments | **0**     |
| Mean teach-as-is           | 2.43                     | **4.86**  |

**Paired delta +2.43 (95% CI 1.03 to 3.83), 6W–0L–1T — SIGNIFICANT.** The
first statistically significant teach-as-is movement, and the loop working
end-to-end: Prof found it → twin promoted it → probe-bisection rooted it →
the fix landed → the twin proved it. Next gates to 7+: templated sameness
(the grounding lane) — u2's tie verdict ("the visible content is effectively
the same") shows what remains once corruption is gone.

---

## Grounding lane, slice 1 — second significant movement (July 2, 2026)

Prof's grounded-fraction scan located the gap precisely: the syllabus was 2%
grounded and opens every reading order; lesson plans 15%; meanwhile each
lesson's enrichment carried 6 quiz items, 4 key terms, and kernel facts that
never reached those surfaces (including a silent routing-to-nowhere: the
v0.15.187 `keyVocabulary` field was never rendered by any exporter).

Four deterministic kernel-first routes: schedule rows state the week's core
ideas; homework is the authored task; the formative check is the enrichment's
own quiz question; the exit ticket closes on a different kernel atom than the
lesson opened with. Grounded fractions: syllabus 2%→11%, lesson plans 15%→18%.

**Twin verdict (seam-fixed vs grounded, 3 rounds pooled, 23 pairs, $1.24):
paired delta +1.304 (95% CI 0.22 to 2.39), 12W–7L–4T — SIGNIFICANT.** Judges:
_"adds actual core ideas and key terms in the weekly schedule, rather than
leaving the schedule as mostly title repetition."_

One instrument fix was load-bearing: raw char-budget packet cuts read as
broken exports and differed between twin sides; packets now cut at paragraph
boundaries with an explicit continuation marker.

### The cumulative twin arc on one generation

| Compiler                                | Mean teach-as-is |
| --------------------------------------- | ---------------- |
| Pre-seam-fix                            | 2.43             |
| + seam fix (+2.43 significant)          | 3.83\*           |
| + grounding slice 1 (+1.30 significant) | **5.13**         |

_\*3.83 is the same compiler as the 4.86 measured in the seam-fix round —
judge-pool variance between rounds; deltas within pairs are the stable
statistic, which is the point of the twin._

Teach-as-is has moved from ~2.4 to ~5.1 on the same generation, every step
measured. The remaining gap to 7+ ("teachable with light edits"): assignments
(3% grounded, 586 sentences), rubrics (4%), discussions (9%) — slice 2
candidates — plus the alignment theme (#3) which no prose routing fixes.
