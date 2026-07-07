# Trellis Roadmap v0.1.4 — the instrument & tool inventory, with a plan per item

_July 4, 2026. Input: the PROF-BENCH v1.1 head-to-head (adjudication
2026-07-04) plus the standing findings ledger. Format: for every tool we
have built — measurement first, generation second — its measured state,
its sharpest known weakness WITH evidence, and one concrete improvement
with an exit bar. The hourly improvement cron executes from this queue
top-to-bottom within its budget discipline. Ground rules (TRELLIS.md
§11) unchanged._

---

## A · Measurement instruments

### A1 · PROF-BENCH classroom battery (`scripts/prof`, v1.1.0)

- **State:** versioned, frozen, calibrated (digit tokens); runs in-pipeline
  at stage 7c and standalone; $0.
- **Weakness:** learning-rule parameters are literature-grounded but
  hand-set; intake-graph variance (repair band 0.51–0.82 on identical
  code) makes single runs meaningless and slows every experiment.
- **Plan:** (a) SAME-GRAPH mode — a bench flag that replays a frozen
  graph through authoring so classroom deltas isolate content changes
  from intake luck (kills the biggest noise source we have measured);
  (b) parameter provenance table in PROF_BENCH.md — each learning rule
  cites its literature anchor and its hand-set constant, so calibration
  debates are about numbers, not vibes.
- **Exit bar:** two same-graph runs of identical code within ±0.03
  repair; provenance table covers every constant in learningRules.json.

### A2 · Cross-family judge panel (`trellis/advisoryJudge.mjs`)

- **State:** 2 openai + 1 deepseek-v4-pro seats, per-family scores,
  visible seat failures; bias measured ±1 and unflattering twice.
- **Weakness:** samples ONE lesson's three artifacts — a package is 90+
  artifacts; single-lesson sampling is why judge overall swings with
  which lesson gets drawn.
- **Plan:** multi-lesson sampling (3 lessons: early/middle/late, same
  seats), reported per-lesson and pooled; add rubric anchors to the
  prompt (what a 5 vs 7 vs 9 looks like, one line each) to shrink
  seat-to-seat spread.
- **Exit bar:** pooled 3-lesson panel on one package at ≤$0.03; within-
  family seat spread ≤1 on two consecutive panels.

### A3 · Adjudicated read (charter protocol, `docs/adjudications/`)

- **State:** protocol live; round one caught a class the panel missed
  (self-answering stem scored 7 by the panel, 5.5 by the read).
- **Weakness:** cadence and blinding are undefined — reads happen when I
  decide, on artifacts I chose, knowing which pipeline is which.
- **Plan:** fixed cadence (every bench release + any launch-gating
  claim) and a semi-blind procedure: artifacts extracted and
  format-normalized by script (the humanPacket machinery, repurposed)
  before the read, provenance revealed only after scores are written.
- **Exit bar:** next adjudication runs semi-blind via the packet
  extractor; cadence written into PROF_BENCH.md.

### A4 · Deep grader v1.8.0 (regression floor)

- **State:** reframed as floor; both pipelines 96–99/A.
- **Weakness:** none to fix at the floor role — the risk is scope creep
  back into "quality signal."
- **Plan:** none beyond role discipline: it gates regressions (P0/P1
  classes), and any urge to raise ITS bars gets redirected into
  PROF-BENCH versioned releases per the standards-trajectory decision.
- **Exit bar:** n/a (role held).

### A5 · Judgment layer J1–J12 + V1–V7 (in-pipeline gates)

- **State:** converged — 1–6 residuals/run, all disclosed; J11 delegates
  to the bench matcher (no mirrors).
- **Weakness:** J2 one-tier Bloom advisories linger in every findings
  list as noise; nothing checks quiz COVERAGE BREADTH (the head-to-head
  finding: four good items orbiting one misconception family while
  mutation/iteration went untested).
- **Plan:** J13 COVERAGE-SPREAD — deterministic check: a lesson quiz on
  a concept with ≥2 misconception families must not spend >50% of its
  items on one family; routes to the bank-selection spread fix (B1),
  not to repair.
- **Exit bar:** J13 live with tests; bench11-class quizzes flagged by
  J13 before any judge sees them.

---

## B · Generation machinery

### B1 · Item bank + harvester (`knowledge/itemBank.mjs`, 1,452 items/72 kernels)

- **State:** 60–70% weekly coverage, $0 selection, aesthetic gates
  (meta/length/truncation/fence), provenance-tracked.
- **Weakness:** THE head-to-head finding — selection dedupes stems but
  not misconception families, so a lesson can draw four off-by-one
  items and zero mutation items; also single-discipline depth (cs-heavy).
- **Plan:** (a) coverage-spread selection: tag each banked item with the
  misconception family it catches (already computable at harvest);
  selection takes at most ceil(K/2) items per family and fills across
  families first; (b) bank breadth: the cron's course rotation
  (stats → geology → psych → econ) grows non-cs shelves, re-harvest
  after each bar-passing run.
- **Exit bar:** J13 clean on three consecutive bank runs; judge quiz
  ≥7.5 pooled on the A2 multi-lesson panel; bank ≥100 kernels.

### B2 · Gate-validated blends (options + explanations)

- **State:** partial acceptance, nano→mini escalation, cosmetic by
  construction; 47–58 of ~60 accepted per run.
- **Weakness:** the ~20% reject tail keeps pasted forms (LA math worst);
  rejects re-enter every run and re-fail the same way.
- **Plan:** persist reject fingerprints per run dir; a reject that fails
  twice goes to ONE mini-seat rewrite with the full item as context
  (not the batch prompt) before keeping the paste — bounded to the
  standing $0.30/cycle cap.
- **Exit bar:** blend acceptance ≥90% on cs AND LA.

### B3 · Overnight batch transport (`providers.batchCallModels`)

- **State:** mechanics proven (probe at batch rates, single-model
  partitioning fixed, honest transport digest); full-course validation
  still pending a queue-friendly window.
- **Plan:** the cron's queue item 2 stands: probe, then one full
  `--bank all --overnight` cs run; record the real cost (projected
  ~$0.08) and wall-clock honestly, including queue time.
- **Exit bar:** one completed overnight course with batch-entries > 0
  and total ≤$0.10, digest telling the truth about both.

### B4 · Deterministic passes (splice + corrective pairing)

- **State:** instrument-mirrored (imports the bench matcher), scoped
  honestly (no force-mapping), lesson-level dedupe, belief-length floor.
- **Weakness:** splice fires less after the honesty fixes (by design) —
  catch now leans on bank items and fresh authoring; fine on cs,
  unproven on dense disciplines.
- **Plan:** fold into B1's family tagging: splice picks the UNCOVERED
  family first (same data, better targeting). No new machinery.
- **Exit bar:** LA catch stays ≥60% across two runs with family-first
  splicing.

### B5 · Knowledge chain (genome link → flywheel + verify → entailment → readings verify)

- **State:** all live; entailment downgrades 13–46 claims/run honestly;
  flywheel verification same-family (deepseek now available!).
- **Plan:** flip flywheelVerify to the `ds` tier — TRUE cross-family
  fact verification (the original design intent, key-gated until now);
  same for the entailment checker on a measured A/B (nano vs ds-flash
  cost/quality).
- **Exit bar:** flywheelVerify cross-family by default; disclosure line
  updated; cost delta ≤$0.01/course.

### B6 · Export adapter (7 DOCX features + per-lesson PPTX)

- **State:** 22 Office files, grader-parser round-trip OK.
- **Weakness:** rubrics feature unmapped; PPTX theme fixed at 0.
- **Plan:** low priority — map `rubrics` (assignment rubricBands exist in
  authored data); one cycle, token-free.
- **Exit bar:** 8 features round-trip.

### B7 · Replan/diff machinery (M4)

- **State:** proven in the drill (locked weeks untouched, 2/7 lessons
  re-authored) but unused since — no bank/blend/bench integration.
- **Plan:** one drill on a CURRENT run: replan bench11-trellis dropping
  one lesson, verify the re-authored slice uses the bank and passes the
  battery; this is the D4 semester story and it should not rot.
- **Exit bar:** replan drill green on v0.1.3+ machinery, ≤$0.05.

### B8 · Hourly improvement cron

- **State:** live, session-bound, budget-disciplined; cycle 1 (run
  interactively) retired a defect class.
- **Weakness:** its priority list is frozen in the job prompt and now
  superseded by this document.
- **Plan:** this roadmap IS the queue — the §20 tail entry points here,
  and the cron's bootstrap reads §20 first, so no job edit is needed.
  Queue order: B1 → A5(J13) → B3 → A1(same-graph) → A2 → B5 → B2 →
  A3 → B7 → B6.
- **Exit bar:** each cycle names its roadmap item in the §20 entry.

---

## Priority rationale

B1+A5 first because the head-to-head named quiz coverage-narrowness as
the one weakness every instrument family agrees on, and the fix is
deterministic (selection + a new check — no model risk). B3 next
because it is finished machinery awaiting one proof. A1 same-graph mode
is the highest-leverage MEASUREMENT fix — it removes the variance that
currently makes every classroom experiment cost 3× the runs it should.

## Budget

Standing cron discipline ($0.30/cycle, $5/day) covers everything here;
the only items with real spend are B3's proof run and B2's mini-seat
rewrites, both inside per-cycle caps.
