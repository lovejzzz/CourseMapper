# Tendril Roadmap v0.1.2 — Register, Re-baseline, Reckoning

_July 4, 2026. Input: v0.1.1's named levers (E2's dominated-but-shy
frontier; the exposure-drift ruler defect) and the owner ask for a
cross-pipeline comparison._

## S1 · E2 round 2 — student-register triplets ($0.05 + $0 training)

- **Finding:** E2 (bank-register triplets) dominated E1's frontier at
  every margin but missed the joint bar. The train/deploy register gap
  is the suspect: it trained on option/explanation prose, it is scored
  on typed student answers.
- **Fix:** generate a TRAINING paraphrase corpus in student register
  (ds tier) from kernels DISJOINT from the frozen eval's 60 — wrong
  answers per family + correct answers per kernel — and retrain with
  those as positives/negatives alongside the bank texts.
- **Leakage rule:** no training text from the frozen eval files, and no
  generation against the eval's 60 kernels at all.
- **Exit bar (unchanged, pre-registered):** some margin on item-options
  reaches familyAcc ≥80% AND falseFire ≤20% on the frozen rulers →
  adopt path opens (dedupe ruler + ε recal before shipping); miss →
  shelve again, Tendril-D becomes active roadmap.

## S2 · Drift-free ruler re-baseline ($0.12)

- **Finding:** every composed "same-graph" comparison since e7e drew
  from drifting exposure counters; v0.1.1 shipped --freeze-exposure but
  no baseline exists under it.
- **Fix:** one eps-default composed LA run with --freeze-exposure on
  the current bank/store = **ruler v2 baseline**; all future composed
  comparisons anchor here.
- **Exit bar:** recorded baseline (grade, findings, battery, cost); no
  quality bar — this run IS the ruler.

## S3 · The reckoning — all pipelines, one table ($0 new spend target)

- **Method:** assemble from measured artifacts: Compiler (crucible +
  Prof verdicts on record), Trellis (v0.1.8 battery/grades/panels),
  Composer (e7e/e8), Composer+Tendril (S2 baseline), plus the
  capability rows only Tendril has (typed-answer tutoring 81.7%,
  offline $0 runtime, S ≥ nano on gates). Fresh spend only if an
  artifact is missing and material.
- **Deliverable:** docs/PIPELINE_COMPARISON_2026-07.md with provenance
  per number (run id / report / date) — no unstamped claims.

## Budget

≤$0.50 total (S1 ~$0.05, S2 ~$0.12, S3 $0 target + contingency).
