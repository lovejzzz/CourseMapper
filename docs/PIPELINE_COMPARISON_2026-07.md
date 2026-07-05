# The Four Pipelines — one table, July 2026

_July 4, 2026 · every number carries its provenance (run id / report /
date) · SIMULATED instruments (PROF-BENCH v1.1-1.2 culture; 2-human
anchor rule stands) · assembled for the owner's "comparison between all
the pipelines"._

## 1. What is being compared

| | Architecture | One line |
| --- | --- | --- |
| **Compiler** | blueprint + templates; machine writes prose | the shipping app pipeline (v0.15.185+) |
| **Trellis** | typed graph + deterministic judgment J1–J13; model writes, machine judges | the side-build that made quality inspectable |
| **Composer** | assemble from a judged asset library; model only skins seams and fills gaps | the third architecture; Trellis is its factory |
| **Composer + Tendril** | Composer + on-device embedding intelligence in selection/dedupe (and Tutor/S at runtime) | the current lab head |

## 2. The table (per ~14-lesson course, draft/default tiers)

| Metric | Compiler | Trellis | Composer | Composer+Tendril |
| --- | --- | --- | --- | --- |
| Grader | 99/A ⁽¹⁾ | 98–99/A ⁽²⁾ | 97/A ⁽³⁾ | 97/A ⁽⁴⁾ |
| Judge panel (teach-as-is, cross-family) | **5–6 / 10** ⁽¹⁾ | **8–9 / 10** ⁽²⁾ | 7.67–9 / 10 ⁽³⁾ | (inherits Composer) |
| Adjudicated read | ~5 ⁽¹⁾ | ~8 ⁽¹⁾ | — | — |
| Prof classroom repair battery | — (teach-as-is 3.43, CI 2.70–4.16) ⁽⁵⁾ | 0.497–0.603 ⁽²⁾ | 0.518–0.545 ⁽³⁾ | 0.464–0.523 ⁽⁴⁾ |
| Judgment findings shipped | opaque (no J-instruments) | 0–2 disclosed | 1–4 (J7 echo class) | **0 — echo eliminated** ⁽⁴⁾ |
| Cost / course | $0.12 ⁽¹⁾ | $0.145–0.33 ⁽²⁾ | **$0.063–0.068** ⁽³⁾ | $0.088–0.096 ⁽⁴⁾ |
| Wall time | ~217 s ⁽¹⁾ | 116–191 s ⁽²⁾ | ~3–8 min observed ⁽³⁾ | ~4–9 min observed ⁽⁴⁾ |
| Reuse (marginal course) | 0% — every course full price | 0% + bank items | **95–99% by surface area** ⁽³⁾ | 99% ⁽⁴⁾ |
| Wrong-key protection | none | J1 + repair | + blind cross-family solver gate | same |
| Typed-answer tutoring | none | none | none | **81.7% family accuracy, on-device, $0** ⁽⁶⁾ |
| Offline student artifact | none | none | none | **99MB Tutor bundle, WebGPU 0.3s** ⁽⁶⁾ |
| $0-runtime rewrite model | — | — | — | **Tendril-S 72.5% ≥ nano 71.7% on deployment gates** ⁽⁶⁾ |
| Diagnosis trajectory | — | — | — | false-fire 33.3%→21.7% at ~81% acc in two $0 rounds (E2b shelved 1.7pts from the joint bar) ⁽⁶⁾ |

**Provenance.** ⁽¹⁾ same-day head-to-head July 3 + PROF-BENCH v1.1
bench11 July 4 (TRELLIS.md §20; docs/adjudications/2026-07-04-bench11):
current pipeline 99/A · judge openai 6,6 · deepseek 5 · adjudicated ~5 ·
$0.12 · 217 s. ⁽²⁾ v017-cs-replay 98/A $0.177 battery 0.603;
v017-la-replay 97/A $0.333 battery 0.497; bench11 fresh run $0.145/191s
98/A judge 8,8/9/~8. ⁽³⁾ e7e-composer-la 97/A $0.063 battery 0.545
panel 9; e8-fresh-cs (graph never seen) 97/A $0.068 battery 0.518 panel
7.67 (COMPOSER_E6_REPORT + §20 2026-07-05 entries). ⁽⁴⁾
tendril-la-eps92 97/A $0.088 findings NONE battery 0.523;
tendril-ruler-v2 (drift-free baseline, --freeze-exposure) 97/A $0.096
findings NONE battery 0.464. ⁽⁵⁾ Prof Adoption arena teach-as-is
(PROF_IMPROVEMENT_FINDINGS.md). ⁽⁶⁾ TENDRIL_BUILD_REPORT.md
(T-M1c/T-M3/R2/Phase 2).

## 3. Honest caveats on the table

- **Battery noise band ±0.03–0.06.** Three near-identical composed
  configs measured 0.464 / 0.494 / 0.523 — and the v0.1.1 post-mortem
  proved WHY: exposure counters drifted between "same-graph" replays
  until `--freeze-exposure` (July 4). Composed battery differences under
  ~0.06, including Composer-vs-Trellis-LA and the R3 "miss," are within
  band. Cross-PIPELINE battery gaps larger than that (cs: Trellis 0.603)
  remain directional.
- **Grader ceiling.** 97–99/A everywhere — the grader stopped
  discriminating between these pipelines long ago; the judge panel and
  the classroom battery are the discriminating instruments.
- **Judge scores are advisory** (cross-family, versioned protocol,
  adjudicated reads on disagreement), n small; the 2-human anchor has
  still never run.
- **Compiler numbers are its best recorded day** (post-v0.15.185
  fixes). Its Prof teach-as-is 3.43 predates some fixes; its judge 5–6
  is contemporaneous (July 3–4).

## 4. What the table says

1. **The Compiler is the cheapest way to ship prose a judge scores
   5–6 and simulated students repair worst.** Its floor is
   architectural (mail-merge lineage); every course pays full price.
2. **Trellis buys the top judge scores (8–9) and the best measured
   classroom battery (0.603 cs)** at 1.2–2.7× the Compiler's cost. It
   is also the only pipeline that can create NEW judged content — which
   is why it remains the factory.
3. **The Composer is the cheapest good course** ($0.063–0.068 at 95–99%
   reuse, panels 7.67–9) — and its marginal economics are the point:
   the second course from the library costs cents, not dollars.
4. **Tendril doesn't compete on the course table — it removes the
   table's blind spots and adds rows no pipeline had.** Inside the
   Composer it eliminated the shipped-echo class (findings NONE on
   every post-dedupe ruler) for +$0.02–0.03/course. Outside it, it
   turned the package into a TUTOR: typed-answer diagnosis at 81.7%,
   offline, $0 per use, forever — and its distilled S now clears the
   deployment gates at a higher rate than the paid nano tier (72.5%
   vs 71.7%) on the tasks that used to be the Composer's only per-run
   model spend.
5. **The stack, not a winner.** The measured system is: Trellis
   authors and judges → the library compounds → the Composer assembles
   at cents → Tendril selects, dedupes, tutors at $0. The Compiler is
   the only layer with no role in that stack.

## 5. Addendum (July 5): the same course through every pipeline — including $0

Owner: "test it with different prompt, compare results with other
pipelines." Course: **Introduction to CS with Python** (the one course
all four pipelines have measured) + a deliberate out-of-coverage probe.

| cs-python | Compiler | Trellis | Composer (paid) | **Composer ZERO** |
| --- | --- | --- | --- | --- |
| Grader | 99/A | 98/A | 97/A | **98/A (P0=0 P1=0** P2=6) |
| Judge panel (cross-family) | 5–6 | 8–9 | 7.67 | **6.67 [6,7]** |
| Cost | $0.12 | $0.145–0.177 | $0.068 | **$0.0000** |
| Battery | — | 0.603 | 0.518 | 0.404 † |
| Findings shipped | opaque | 0–2 | 1–4 | 2 (J2+J8, disclosed, unrepaired) |

† zero withholds all grounding citations (the honest policy after the
64% false-keep calibration), and claim refs double as the classroom's
item→concept mapping — a known ~0.1 battery penalty; the decoupling
lever recovers it for every pipeline.

**Reading:** the $0 pipeline judges ABOVE the Compiler (6.67 vs 5–6 at
$0.12) and one point below the paid Composer. The gap is not diffuse —
the panel located it: 8 of 9 sampled artifacts scored 5–9 (study guides
9/9/9), while Lesson 13 "Debugging and Testing" scored 4.33 because the
library holds no debugging move-assets and zero mode assembled adjacent
content instead. Unrepaired quiz-feedback residue (the no-model-repair
cost) is the second named complaint. Panel spend $0.041 (measurement,
not generation).

**The boundary probe:** zero mode on World Literature — a discipline
with bank items but NO harvested prose assets — refused all 14 lessons
("zero-mode compose: plan needs ≥3 segments") and shipped nothing but a
$0 ledger. **Where the library covers, $0 works; where it doesn't, zero
mode fails loudly instead of authoring fiction.** That refusal is the
design working: coverage is the currency, and the factory is how you
mint it.

**Named next levers from this round:** (1) topic-match disclosure —
Tendril-E can flag off-topic assembly (lesson title vs selected assets)
at $0 before a judge ever sees it; (2) claims/mapping decoupling
(~+0.1 battery, all pipelines); (3) lit/history move-asset harvest or
factory run = the C6 library build-out already awaiting owner spend.

_— Fable 5_