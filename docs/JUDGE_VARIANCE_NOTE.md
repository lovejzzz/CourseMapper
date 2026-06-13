# The Advisory Judge: variance characterization (v0.15.2, T1)

_Source: all 11 judged Crucible rounds stored as of June 12, 2026 — 51 judged
artifacts. The question this note answers, per the v0.15.1 roadmap: can the
judge ever gate, or does it stay advisory forever?_

## The numbers

| course             | n      | min   | max   | mean     | sd       |
| ------------------ | ------ | ----- | ----- | -------- | -------- |
| world-lit          | 10     | 4     | 6     | 5.40     | 0.66     |
| world-lit-readings | 3      | 4     | 6     | 5.33     | 0.94     |
| geology            | 6      | 3     | 6     | 4.50     | 0.96     |
| econ-intro         | 5      | 4     | 5     | 4.20     | 0.40     |
| cs-python          | 13     | 3     | 5     | 4.08     | 0.62     |
| mandarin           | 7      | 3     | 5     | 3.86     | 0.83     |
| psych-101          | 3      | 3     | 4     | 3.67     | 0.47     |
| **all**            | **51** | **3** | **6** | **4.35** | **0.97** |

(Single-observation courses — astro, nursing, nutrition, stats — excluded
from per-course statistics; included in the totals.)

## What the data says

1. **Per-course noise is about ±1 point** (sd 0.40–0.96 on identical or
   near-identical packages across same-day rounds). A one-point difference
   between two arms of an A/B is **within noise** — which the voice trials
   then demonstrated empirically: two rounds of +1 wins followed by a round
   of four exact ties.
2. **The judge reliably tracks COURSE IDENTITY, not run luck**: world-lit
   sits a full 1.5 points above mandarin/psych across every round. The
   between-course spread (≈1.7 points of means) exceeds the within-course
   noise — the judge is measuring something real about content, coarsely.
3. **The ceiling is stable**: the global band has been 3–6 across eleven
   rounds spanning three releases and both authoring modes. Nothing we have
   shipped so far — including voice — moves the band; at best it moves
   single courses one notch.

## The verdict

**The judge stays advisory.** With sd ≈ 1 on a 10-point scale, any
single-reading gate would flap on noise. Two usable instruments fall out of
the data instead:

- **A/B protocols must require a ≥2-point margin or aggregate ≥6 judged
  pairs** before claiming a win. (The voice flip's 3-0-5 record satisfies
  the aggregate form: 8 judged pairs, zero losses.)
- **The band itself (3–6) is the real KPI.** The v0.15+ teachability work
  should be judged by whether the per-course MEANS move — e.g. mandarin
  3.86 → 5+ — not by single-round readings. The trajectory table in every
  ROUND_REPORT now carries the history needed to see it.

Re-characterize after any judge model/prompt change — these numbers are for
the current judge (gpt-5.4-mini, single reading, 1–10 scale).
