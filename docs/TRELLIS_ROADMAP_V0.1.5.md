# Trellis Roadmap v0.1.5 — Deep Shelves

_July 4, 2026. Input: v0.1.4's three measured findings — J13 located the
bank-depth bottleneck (28/72 kernels hold ≥2 catch families vs 12/12
documented in the genome), the multi-lesson panel discovered late-course
quiz decay (L4 7.33 → L13 5.33, thin late shelves), and the blend tail
sits at 88% vs the 90% bar (math-dense correctives). One diagnosis
underneath all three: the bank's shelves are shallow and uneven, and
everything downstream inherits it. This release makes the bank DEEP
directly, instead of waiting for organic harvest growth._

## 1 · Bank gap-fill authoring (the headline)

- **Finding:** spread selection cannot select diversity that harvests
  never captured; 44 kernels are single-family or untagged while the
  genome documents ≥2 misconceptions everywhere it matters.
- **Fix:** author items DIRECTLY INTO THE BANK — a new
  `bankGapFill` pass enumerates (kernel × documented misconception
  family) cells with no banked item and authors one reason-bearing item
  per cell in batched mini calls, accepted only through the SAME gates
  the harvest applies (catches its family by the bench matcher,
  confronts the corrective, aesthetic gates, 4 distinct options) plus
  J1 dedupe against existing shelf items. Provenance `gapfill` with a
  stamp — bank items now carry `harvest` or `gapfill` origin, disclosed.
  This is how a benchmark-grade asset grows: deliberately, gated,
  provenance-tracked — not only as exhaust.
- **Cost:** one-time ~$0.05–0.10 for ~44+ cells; permanent asset.
- **Exit bar:** ≥55/72 kernels multi-family; every gap-fill item passes
  the full gate stack; origin mix disclosed in the bank header.

## 2 · Shelf telemetry (measure what lessons actually draw)

- **Finding:** late-course decay was invisible until A2; per-lesson
  shelf depth is still invisible.
- **Fix:** the itemBank digest line gains per-lesson coverage
  (banked/total per lesson, min-shelf lesson named), so thin shelves
  show up in every run's digest instead of waiting for a panel.
- **Exit bar:** digest names the thinnest lesson; decay hypothesis
  checkable from any single run's digest.

## 3 · Blend math tail

- **Finding:** explanations 58/66 (88%) — the tail is math-dense
  correctives that need more room than 60 words.
- **Fix:** the per-item tail rewrite allows 80 words and, when the item
  still fails on mini, tries ONE deepseek-v4-flash seat (different
  family, different failure mode) before keeping the paste.
- **Exit bar:** combined blend acceptance ≥90% on the validation run.

## 4 · Validation — the same-graph protocol, used as designed

- **Design:** the bench11 frozen graph is the ruler. We already hold
  pre-gap-fill replays (v014-samegraph-a/b: repair 0.584/0.579, J13 15,
  panel decay L13 5.33 measured on fresh bench11). After gap-fill: ONE
  same-graph replay + multi-lesson cross-family panel. Any delta is the
  bank's doing — intake variance is out of the experiment by
  construction.
- **Exit bars:** J13 warnings ≤5 on the replay (from 15); L13 quiz
  panel ≥6.5 (from 5.33); classroom repair within the same-graph band
  (no regression); cost stays ≤$0.15 live.

## Sequencing & budget

1 (gap-fill module + run) → 2 (telemetry) → 3 (tail tweak) → 4
(replay + panel + report). Estimated total ≤$0.35: gap-fill ~$0.08,
replay ~$0.15, panel ~$0.025. Standing rules: 97-test suite green
before every commit; §20 entries; SIMULATED stamps; the cron continues
from this document once the interactive session ends.
