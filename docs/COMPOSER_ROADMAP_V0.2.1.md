# Composer Roadmap v0.2.1 — Quality Pass

_July 4, 2026. Input: E6's residual queue. Three fixes, one frozen-
ruler validation._

## 1 · Per-part claims (the repair −0.02 suspect)

- **Finding:** E6 mapped every claim to the lesson's single anchor
  concept; Trellis maps per item. Prof attributes items to concepts via
  kernel claims — coarse claims distort catch/repair attribution and
  entailment checks explanations against the wrong kernel's facts.
- **Fix:** banked quiz items claim their OWN concept (selection already
  knows it); fresh items claim the anchor unless stem-overlap says
  otherwise; segments/guide keep the anchor (they are anchor content).
- **Exit bar:** classroom repair back inside the same-graph band
  (≥0.554) on the E6b replay.

## 2 · The solver gate (the 'scarcity' class, generalized)

- **Finding:** a fresh item may key an answer that is simply wrong —
  invisible to every lexical instrument; only the adjudicated read
  caught it.
- **Fix:** a cross-family SOLVER seat (deepseek-v4-flash) receives each
  fresh item WITHOUT the key and answers it; solver ≠ key → the item is
  rejected and re-authored once, then dropped honestly (5-item quizzes
  are legal; wrong keys are not). Applied at: composer fresh fills and
  bankGapFill intake. ~$0.0003/item.
- **Exit bar:** gate live with tests; zero solver-flagged items shipped
  in E6b; flagged-rate reported.

## 3 · Quiz mix 4+2 (lesson fit)

- **Finding:** E6 filled quizzes to 6 banked where shelves allowed;
  Trellis's best-judged quizzes were 4 banked + 2 fresh lesson-specific
  items. Composer quiz paneled 7–7.33 vs plans 8.3–9.
- **Fix:** maxBanked 4 (review cap inherited), 2 fresh solver-verified
  items per lesson.
- **Exit bar:** panel quiz mean ≥7.5 across the three sampled lessons.

## Validation — E6b

Same frozen bench11 ruler, full battery + 3-seat panel. Bars: repair
≥0.554 · panel overall ≥7.5 (hold) · quiz mean ≥7.5 · cost ≤$0.08 ·
reuse ≥85% (drops slightly by design with 2 fresh items — disclosed).
Budget ≤$0.15 including panel.
