# Trellis Roadmap v0.1.2 — closing the "not as good" list

_July 3, 2026. Input: the honest pipeline comparison after v0.1.1
(report §5h). Trellis wins content quality on every instrument we own
(paired judge +2.9, classroom repair 0.77–0.80 vs ~0, catch ≥60% vs 9%)
— this roadmap addresses only the five places it is measurably NOT as
good as the current pipeline. Every item carries evidence, an exact fix,
and an exit bar on an instrument that already exists. Generator bumps
trellis@0.1.1 → 0.1.2. Ground rules (TRELLIS.md §11) unchanged: never
touch src/ behavior, borrow by import, all spend ledgered, SIMULATED
stamps until the human anchor._

## 1 · Cost — back at or below the current pipeline

- **Evidence:** lean lands $0.177–0.212 vs current ~$0.13. Run-9 ledger:
  the mini quiz call is $0.11 of it (output-dominated); everything else
  (nano authoring, entailment, verification, gate) totals ~$0.06.
- **Fix:** (a) a `thrift` tier — quiz on NANO, everything else as lean.
  The judged 6-vs-8 nano-quiz gap was measured BEFORE reason-bearing
  distractor prompts, deterministic splice/pairing, and the blend pass
  existed; the machinery may have closed it. Measure, don't assume:
  paired A/B on cs-python, two judge seats each side. (b) static-prefix
  prompt ordering (rules first, per-lesson blocks last) so OpenAI
  prompt caching can bite on the shared prefix. (c) keep mini quiz as
  `lean` if thrift's quiz judges < 8 — cost is not bought with quality.
- **Effort:** one models.json entry + prompt reorder + one A/B session.
- **Exit bar:** a tier at total ≤ $0.13 with judge quiz ≥ 8; if no tier
  clears both, publish the measured frontier and keep lean the default.
- **Instrument:** run ledger + advisoryJudge (2 seats/side).

## 2 · Quiz aesthetics — the corrective belongs INSIDE the explanation

- **Evidence:** two judge seats: overall 8/8 but quiz 7/7 (bar 8), both
  naming the machine-appended correctives — "repeated feedback blocks."
  41–98 appends/run; LA worst. The guarantee machinery and the aesthetic
  instrument pull against each other.
- **Fix:** `blendCorrectives` — after the deterministic append pass, ONE
  batched voice call rewrites each appended explanation to integrate the
  corrective naturally (vary openers, no stacked sentences). Each
  rewrite is accepted ONLY if `confrontsCorrective` still passes —
  otherwise the appended version stays (guarantee preserved, blend is
  cosmetic). Quiz prompt simultaneously teaches paraphrase-with-key-
  terms so fewer appends fire at all. Counted and disclosed.
- **Effort:** one voice module + pipeline stage 6g + afterRound wiring.
- **Exit bar:** judge quiz ≥ 8 (2 seats) with classroom repair still
  ≥ 0.70 on cs-python — both instruments, same run.
- **Instrument:** advisoryJudge + in-pipeline classroom gate.

## 3 · Generalization — the loop must transfer, not the course

- **Evidence:** held-out linear-algebra fails the classroom bars twice
  (repair 0.42/0.45, catch —/57%, compliance 0.31, 5 unexposed items)
  while cs-python passes 3/4. The refine loop was course-local.
- **Fix:** diagnose LA from classroom.json EVIDENCE fields (which items,
  which concepts) — then fix only pipeline-level roots (candidates:
  exam/quiz items on thinly-exposed concepts → J12 scope; math's deep
  prerequisite chains → spaced reinforcement at intake, i.e. lessons
  reinforce 1–2 recent prerequisite concepts — the spacing effect,
  pedagogically sound on its own). NO course-specific hacks. Re-run LA,
  regression-run cs, then one FRESH held-out course (stats-intro)
  reported exactly as it lands.
- **Effort:** one diagnosis session + 1–2 pipeline edits + 3 runs.
- **Exit bar:** LA repair ≥ 0.60 and unexposed ≤ 2 (honest intermediate
  toward the 0.70 bar), cs does not regress, stats-intro reported as-is.
- **Instrument:** classroom gate on all three runs.

## 4 · Product surface — every printable artifact through the app's real builders

- **Evidence:** export parity covers 2 of 9 features (lesson plans, quiz
  bank as DOCX). The app ships DOCX/PPTX/PDF everywhere; "content-only"
  caveats every quality claim.
- **Fix:** extend `appExportAdapter` to the builders that already exist
  in src/lib/exporters (borrow by import, never copy): studyGuides,
  discussions, assignments, syllabus, courseFaq → DOCX via
  `buildDeliverableDocxBlob`; slide decks → real PPTX via
  `buildSlideDeckPptxBlob` (heuristic text-fit tier is headless-safe
  per the v0.15.1 lesson). Round-trip every file through the grader's
  own docx/pptx parsers. Sync/UI integration is explicitly OUT of
  scope — that is pivot work, not side-build work.
- **Effort:** mappers only (the builders exist); one verification run.
- **Exit bar:** 7–8 features export as real Office files, every file
  round-trips >500 extracted chars; remaining gaps named in the digest.
- **Instrument:** deepQualityGrader extractPackage on the export dir.

## 5 · Proof — more seats now, humans still the verdict

- **Evidence:** every judge number is one gpt-5.4-mini seat; cross-family
  keys (anthropic/google) are ABSENT; the sealed human packet predates
  v0.1.1's content.
- **Fix:** (a) `advisoryJudge --seats N` — N independent same-family
  seats, report per-artifact mean ± range (reduces sampling noise;
  family bias disclosed as unfixable without keys). All v0.1.2 judge
  verdicts use 2–3 seats. (b) regenerate and re-seal the human blind
  packet from a v0.1.2 run so the humans grade what we actually ship
  now. (c) cross-family judging stays KEY-GATED and carried.
- **Effort:** small CLI change + one packet regeneration.
- **Exit bar:** every judge number in the v0.1.2 report is a multi-seat
  mean with range; a fresh sealed packet exists; SIMULATED stamps stand
  until two instructors return it.
- **Instrument:** advisoryJudge; humanPacket.

## Sequencing

2 (blend — the judge bar everything else is measured against) → 1
(cost A/B needs the blend in place) → 3 (LA loop) → 4 (exports) → 5
(seats + packet) → validation table + report §5i.

## Budget

Estimated $1.5–2.5 total (A/B pair, 3 generalization runs, multi-seat
judging at ~$0.003/seat, packet regeneration) — inside the standing
$5-per-experiment gate; every call ledgered.
