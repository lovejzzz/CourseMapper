# Adjudicated read — PROF-BENCH v1.1 head-to-head (cs-python, Lesson 7)

_2026-07-04 · adjudicator: Claude (judge of record per owner decision) ·
rubric: teach-as-is 1–10 per artifact, quoted line-level evidence, ≥3
artifacts per side. Packages: `trellis/runs/bench11-trellis/package`
(trellis@0.1.3, lean+bank, $0.145) and
`verification-output/crucible/round-2026-07-03T16-25-46-176Z/cs-python/extracted`
(current pipeline, July 3)._

## Trellis — bench11-trellis

**Lesson plan: 8/10.** A genuinely teachable session arc
(teach → worked example → paired lab → reteach → closing bridge), and
the reteach does real misconception work: _"testing two wrong guesses:
lst[1] vs 'position 1', and lst[3] vs 'last element'"_ — that is
delayed-correction pedagogy, not a segment label. Deduction: the
anchored quotes are load-bearing but stylistically stiff when four
appear in one plan.

**Quiz: 7/10.** All six items are real assessments; the review items
carry the new `Review:` label (cycle-1 fix visible in production);
explanations confront correctives in plain prose (_"temp is a local
variable created during the function call… the function must return
it"_). Deductions: Q1/Q2/Q3/Q5 all orbit the same off-by-one
misconception family — each does a different cognitive task (predict,
correct, explain, select), which beats repetition-of-fact, but the
lesson's mutation/iteration content goes untested; Q5's distractor D
says _"a 5-item list's last index is 5"_ inside a 3-item problem.

**Study guide: 8.5/10.** Precise anchored key terms, a misconception
list that names the actual wrong beliefs, self-check prompts that
diagnose (_"does x give you indices or the actual list elements?"_),
and a missed-the-reading block that stands alone. Thin on practice
volume.

**Trellis read overall: ~8.**

## Current pipeline — July 3 package

**Lesson plan: 4.5/10.** Real islands — the worked example is correct
and complete, the misconception poll is genuine pedagogy — drowning in
slot-fill: _"press for Autograded quiz: lists evidence about modify
lists"_, _"an observable modify lists move from the way this course
collects exam and retrieval evidence"_ (verbatim twice), _"explain how
functions and scope from Autograded quiz: functions and scope changes
today's modify lists decision"_. A TA cannot read half these
facilitation notes aloud.

**Quiz: 5.5/10 — DISAGREES with the panel's 7 [7,7], reported per
charter.** Strengths: machine-scorable, keys correct. But Q1, Q2, Q4
and Q5 test the same zero-indexing recall fact four times; Q4 answers
itself (_"What is the first element of a Python list stored at index
0?"_); every item is Remember-level despite the banner; the answer
key's "Intended use" lines are template babble (_"turn the most
tempting option into a quick note about missing evidence"_). The
panel's lexical view cannot see self-answering stems; a structured
read can. This is the collision class working as designed.

**Study guide: 5/10.** The key-terms table is genuinely good (honest
IndexError example). The review questions and practice activities are
mangled slot-fill: _"mark the detail that best supports the modify
lists claim"_.

**Current read overall: ~5.**

## Instrument agreement matrix (this head-to-head)

| Instrument | Trellis | Current | Δ |
|---|---|---|---|
| Judge, openai seats | 8, 8 | 6, 6 | +2 |
| Judge, deepseek seat | 9 | 5 | +4 |
| Adjudicated read | ~8 | ~5 | +3 |
| Grader | 98/A | 96–99/A | floor |
| Classroom (v1.1) | repair 0.558 this draw; band 0.51–0.82 | carried baseline ~0 repair / 9% catch | large |

All three independent quality instruments agree on direction and
approximate magnitude (+2 to +4). The cross-family seat did NOT
flatter the same-family output — it ranked Trellis higher and the
current pipeline lower than the openai seats did. One disagreement
(current quiz: panel 7 vs read 5.5) is recorded above, not averaged.
