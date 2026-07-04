# Trellis Roadmap v0.1.7 — Dense Repair

_July 4, 2026. Input: v0.1.6 carries. Three residuals, three suspected
roots: 16 floor-fill stragglers reject SYSTEMATICALLY (so the gate, not
the model, owns the failure); LA repair (0.498) is bounded by catch
SURFACE (one caught family per item across ~90 items against 767
seeds); blend acceptance (84–85%) is bounded by a word cap that ignores
how many correctives an item stacks._

## 1 · Gate forensics on the floor stragglers

- **Finding:** two floor passes, same 16 kernels rejected — systematic.
- **Fix:** instrument `gapItemPasses` to RETURN its rejection reason;
  run a diagnosis pass, publish the reason histogram, fix the dominant
  gate defect (not the model), refill.
- **Exit bar:** reason histogram in the ledgered output; ≥12 of the 16
  stragglers at floor after the gate fix, or the blocker named.

## 2 · Multi-family distractors (the dense-discipline lever)

- **Finding:** repair is bounded by catch surface. An item has THREE
  wrong options; today they typically catch one documented family.
  Three families per item ≈ 3× the catch surface at zero extra items.
- **Fix:** (a) harvest tags `familiesCaught` (count, not just first);
  selection prefers multi-catch items; (b) fresh authoring in DENSE
  mode — when a lesson's concepts document ≥4 families, each item's
  three wrong options state three DIFFERENT documented wrong beliefs
  (reason-bearing, key terms; blends keep them natural).
- **Exit bar:** LA frozen-graph repair ≥0.55 (from 0.498); cs frozen
  replay does not regress (panel ≥7.5 overall, J13 ≤3).

## 3 · Blend room scales with the stack

- **Finding:** the 84–85% acceptance tail is items stacking 2+
  correctives — ≥0.5 term-overlap PER corrective inside one 80-word
  cap is arithmetically brutal.
- **Fix:** word budget scales: 80 + 40 per corrective beyond the first
  (prompt + per-item tail), char gate unchanged (700).
- **Exit bar:** combined blend acceptance ≥90% on both validation
  replays.

## Validation

The two frozen rulers again: LA replay (repair bar), cs replay + panel
(no-regression + blend re-measure). Estimated ≤$0.50. Standing
discipline unchanged.
