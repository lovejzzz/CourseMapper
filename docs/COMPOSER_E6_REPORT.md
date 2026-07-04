# E6 Report — the Composer vs Trellis, on the frozen ruler

_July 4, 2026 · PROF-BENCH v1.1 · frozen graph: bench11-trellis (the
same ruler every Trellis number below was measured on) · all judge
numbers are 3-seat cross-family panels · adjudicated read performed and
recorded per charter._

## Verdict up front

**The Composer met its gate.** Four of five exit bars passed outright;
the fifth (classroom repair) landed 0.02 under the same-graph band and
is recorded as a partial. Per COMPOSER.md §12's decision rule, the
Composer becomes the v0.2 architecture target and the library build-out
is funded. Trellis is not retired — it authored 17 of 239 parts in this
very run and remains the factory.

## The head-to-head (identical graph, identical instruments)

| Measure | Trellis (v016/v017 replays) | **Composer E6** | Δ |
| --- | --- | --- | --- |
| **Cost** | $0.160–0.177 | **$0.060** | **−63%** |
| Calls | 68–82 | 45 | −40% |
| Wall | 195–243 s | 239 s | ≈ |
| Grader | 97–98/A | 98/A (P1=0) | ≈ |
| **Panel overall** | 8 [8,8] | **7.67 [7,8]** | −0.33, in noise |
| Quiz by lesson (L4/L8/L13) | 8 / 7 / 7 | 7.33 / 7 / 7 | flat, no decay |
| Classroom repair | 0.554–0.603 | 0.530 | −0.02 under band |
| Residual findings | 3–4 | 3 (zero catch/pairing classes) | ≈ |
| Blend acceptance | 85–97% | **100%** (64/64 + 7/7) | ↑ |
| **Reuse by surface area** | 57–64% (quiz only) | **95%** (222 reused / 17 fresh parts) | — |

## Exit bars, scored

| Bar | Measured | Verdict |
| --- | --- | --- |
| Reuse ≥80% | **95%** | MET |
| Cost ≤$0.08 | **$0.060** | MET |
| Panel ≥7.5 | **7.67 [7,8]** | MET |
| No seam objection in adjudication top-3 | zero two-voices defects; panel notes read "classroom-ready", "excellent structure" | MET (one nit below) |
| Classroom repair in band (0.554–0.603) | 0.530 | **PARTIAL** (−0.02) |

## The adjudicated read (L8 — historically the weakest lesson)

- **Plan ~8/10.** 50 minutes, coherent arc, and the skin is *visibly
  working*: the reused list worked-example is explicitly bridged into
  the strings context ("then tie it back to text processing: if you
  extract…"), and the reteach walks a native strings misconception
  ("Calling s.strip() changes s in place…") with its correction. One
  recorded nit: an instructor would prefer a native strings worked
  example over a bridged list one — a *shelf-depth* artifact, not a
  seam failure.
- **Quiz ~7/10.** The v0.1.5 all-review defect is fully dead: two
  labeled reviews + four genuine strings items. One flagged defect: Q4
  ("which slice returns 'cat' from 'scarcity'") may have no valid
  answer — 'c','a','t' are not contiguous nor evenly stepped in
  'scarcity'. A fresh-authored item on the thinnest shelf; likely the
  seat that scored 5. **Carried: fresh-item answer-key verification**
  (execute-the-slice class checks) — a deterministic gate candidate.

## What E6 proved and didn't

**Proved:** composition + gate-validated skin matches generation
quality within noise at roughly a third of the cost, on the hardest
ruler we own; the RLO seam problem did not materialize (70/70 segments
skinned, no two-voices objection from any of four readers across two
model families); reuse compounds exactly as the bank precedent
predicted.

**Didn't prove:** cross-discipline transfer (E6 is cs→cs reuse from
same-family sources — the honest best case; LA/stats composition needs
its own pilot after per-move library build-out); classroom repair
parity (0.53 vs band ≥0.554 — plausibly the anchor-concept claims
mapping being coarser than Trellis's per-item claims; diagnosis is a
$0 autopsy); durability of the panel score across fresh graphs.

## Residuals → the v0.2 queue

1. Repair −0.02: autopsy the claims/anchor mapping ($0).
2. Fresh-item answer-key verification gate (the 'scarcity' class).
3. Per-move library build-out beyond cs (COMPOSER.md C6, $15–25).
4. Cross-discipline E7 (LA composition) after C6.
5. Homogenization index measurement once ≥3 same-syllabus compositions
   exist.

## Cost of knowing

E6 total: run $0.060 + panel $0.024 ≈ **$0.084**. The architecture
decision this buys would normally be a quarter's worth of argument.
