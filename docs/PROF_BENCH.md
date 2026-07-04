# PROF-BENCH — the course-teachability benchmark

_v1.1.0 · July 4, 2026 · lives in `scripts/prof/` · this charter governs
how it is run, versioned, and trusted. Established by owner direction
(2026-07-04): no external benchmark exists for "course teachability," so
Project Prof is hardened into one — versioned, frozen between releases,
and run identically against ANY course package regardless of which
generator produced it._

## What it measures

A generated course package is admitted as a structured bundle (lessons,
concepts, quiz/exam items with distractor texts and explanations) and
graded by three independent instrument families:

1. **The zero-token classroom** (deterministic, $0): 25 simulated
   students with sampled traits (aptitude, conscientiousness, reading
   compliance) traverse the full semester under learning rules grounded
   in the retrieval/spacing/misconception-repair literature. Outputs:
   **misconception catch rate** (per-item, bar 0.60), **repair rate**
   (bar 0.70), **compliance robustness** (mastery lost to realistic
   non-reading, bar ≤0.25), **solvability** (weekly + exam), and item
   **psychometrics** (difficulty, discrimination, unexposed items).
2. **The judge panel** (LLM-as-judge): teach-as-is 1–10 per sampled
   artifact plus overall, with written objections. Seats are
   **cross-family by default** — gpt-5.4-mini plus a deepseek-v4-pro
   seat (owner-provided key) — reported as per-family scores and a
   combined mean ± range. A failed seat is reported as failed, never
   silently dropped.
3. **The adjudicated read** (final): a structured artifact read by
   Claude against a fixed rubric — teach-as-is 1–10 with quoted
   line-level evidence, ≥3 artifacts per course, written objections —
   performed for any launch-gating or pivot-gating verdict.

## The adjudication decision (owner, 2026-07-04)

No human validation will occur before launch; **Claude is the judge of
record.** Practically: instrument numbers keep their SIMULATED stamps
(they are model- and simulation-derived, and honesty requires saying
so), the sealed human blind packet remains available but optional, and
any launch-level quality claim must carry all three instrument families
PLUS the adjudicated read — no single instrument, including the
adjudicator, may carry a verdict alone. Where instruments disagree (the
measured classroom-vs-judge collisions), the disagreement is reported,
not averaged away.

## Versioning and change discipline

- The bench version lives in `scripts/prof/arenas/classroom.mjs`
  (`PROF_BENCH_VERSION`). Between version bumps the instrument is
  FROZEN: no rule, bar, or matcher changes.
- Any calibration bumps the version and requires a **re-baseline**: the
  new instrument re-runs over saved packages and the deltas are
  published before any new numbers are reported.
- **v1.1.0** (2026-07-04, owner-directed): the distractor matcher now
  treats digit-bearing tokens as informative at any length — the >3-char
  filter was measurably blind to numeric/code payloads (a pedagogically
  perfect "3" distractor scored zero). Re-baseline over four saved runs:
  repair deltas ≤0.004, course-level catch verdicts unchanged — all
  previously published numbers stand.
- Generators must not carry private copies of bench rules: consumers
  import the bench's own functions (trellis J11 delegates to
  `distractorCatchesMisconception`), so a recalibration cannot silently
  diverge from the mirror.

## Protocol (fixed)

- Classroom: preset `cc-night-class`, cohort 25, seed 1.
- No single-run verdicts: classroom numbers swing with intake-graph
  variance (measured band ±0.15+); claims require multi-run means or
  same-graph pairs. Judge claims require ≥2-point margins or ≥6 pairs.
- Every reported number names its bench version.

## Standards trajectory

The deep grader (v1.8.0) has hit its ceiling at 97–99/A for both
pipelines and now serves as a **regression floor**, not a quality
signal. Per owner direction, rising standards live HERE: bar raises
(catch/repair/compliance), new instrument families, and harder presets
arrive as versioned bench releases with published re-baselines — never
as silent tightening.

## Known limits (standing, disclosed)

- The classroom's learning-rule parameters are literature-grounded but
  hand-set, not fitted to real student data.
- The lexical matcher is a proxy for "a student would recognize their
  own belief"; v1.1.0 removed its worst blindness, others may remain —
  audits-by-reading are part of the bench, not an optional extra.
- The judge panel is two model families, not a human panel; the
  adjudicated read is a model reading too. These limits are why stamps
  say SIMULATED, and why disagreement between instruments is signal.

## Running it

```
# classroom battery (any package with a structured bundle)
in-pipeline: trellis stage 7c · standalone: scripts/prof/arenas/classroom.mjs

# cross-family judge panel on any package dir
npx vite-node trellis/advisoryJudge.mjs <packageDir> "<title>" 15 <openaiSeats>
```
