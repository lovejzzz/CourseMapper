# Trellis v0.1.1 — the classroom-bars roadmap

_July 3, 2026 · the next version of the side-build pipeline
([TRELLIS.md](TRELLIS.md) Part II; current state measured in
[TRELLIS_BUILD_REPORT.md](TRELLIS_BUILD_REPORT.md) §5e–§5g). Version bumps
`trellis@0.1.0 → 0.1.1`; the app's version is untouched by ground rule #2.
Every item below traces to a measured finding — nothing speculative — and
every item carries a measurable exit bar on an instrument that already
exists._

**Where v0.1.0 ends:** lean tier $0.052–0.16/course, 96–99/A grader,
judge 7–9 (pooled paired delta vs the current pipeline **+2.88, 95% CI
[+2.05, +3.70], n=8, all pairs positive**), Prof a2 repair 63.4% (bar 70),
catch 56% (bar 60), compliance loss 27% (bar 25). All numbers SIMULATED;
the sealed human packet is the only verdict that counts.

---

## Tier 1 — clear the classroom bars (Prof a2 names these exactly)

### 1.1 · J3b: item-level corrective pairing → repair ≥ 70%

- **Finding:** repair 63.4% vs bar 70. Only ~35% of items carry
  explanations that confront a corrective, because J3 requires one
  confronting explanation per LESSON; the sim only credits repair when
  the item that caught the student also explains the fix.
- **Fix:** new check `j11b`/J3b — any item whose distractor catches
  misconception M must have an explanation confronting M's corrective
  (same overlap rule as J3). Routes to the existing quiz-section repair
  with the pairing stated in the prompt.
- **Effort:** one check file + one prompt line. **Exit bar:** a2 repair
  ≥ 0.70 on two courses. **Instrument:** `profBridge` + a2.

### 1.2 · beliefForm at the knowledge source → catch ≥ 60%, permanently

- **Finding:** catch 56% vs bar 60, and the §5g coherence fix lowers it
  further by (correctly) refusing to splice meta-framed statements
  ("Students concatenate a number…"). The root cause is upstream: the
  knowledge layer stores misconceptions as observations about students,
  not as splice-able beliefs.
- **Fix:** the misconception schema gains a required `beliefForm` field
  ("Concatenating a number onto a string works without conversion");
  the flywheel extraction prompt demands it; genome imports derive it
  once at assemble time. Splicing and distractor prompts use beliefForm
  exclusively — the coherence-vs-catch trade disappears at the source.
- **Effort:** schema + flywheel schema/prompt + assemble derivation +
  splice switch; half a day. **Exit bar:** a2 catch ≥ 0.60 with zero
  meta-framed options in a content audit sample. **Instrument:** a2 +
  §5g-style content read.

### 1.3 · J12: exposure check + exam blueprint mix

- **Finding:** 2 items test content the cohort was never exposed to;
  exam solvability 0.35–0.43 (exam items land on concepts the covered
  lessons never taught — mostly flywheel concepts).
- **Fix:** J12 — every item's concept must be in the covered lessons'
  introduces/reinforces closure (weekly: its own lesson; exams: the
  covered span); exam blueprints capped near 60/40 apply/transfer.
- **Effort:** pure function, an afternoon. **Exit bar:** 0 unexposed
  items; exam solvability ≥ 0.5. **Instrument:** a2 psychometrics.

### 1.4 · Non-reader path strengthening → compliance ≤ 25%

- **Finding:** compliance loss 27% vs bar 25; the reteach segment earns
  half-strength credit by the sim's own exposure rule.
- **Fix:** (a) the reteach contract requires a worked example inside the
  segment (validator + prompt); (b) the study guide gains a required
  "missed the reading? start here" section. Both raise the non-reader's
  credited exposure without touching the shared ruler.
- **Effort:** contract lines + validator; half a day. **Exit bar:** a2
  compliance loss ≤ 0.25. **Instrument:** a2 battery.

## Tier 2 — the judge's remaining complaints

### 2.1 · Three-way split: quiz on mini, everything else nano

- **Finding:** the lean quiz artifact judges 6–8 vs draft's 8–9 — the
  one measured quality cost of nano.
- **Fix:** quiz items author as their own mini call (the schema already
  exists as `QUIZ_REPAIR_SCHEMA`); plan/guide and surfaces stay nano.
  Projected ≈ $0.11–0.13/course — still at-or-below the current
  pipeline.
- **Effort:** one config knob + one code path; measurable in a single
  run. **Exit bar:** judge quiz artifact ≥ 8 at total cost ≤ $0.13.

### 2.2 · Reading verification tier

- **Finding:** citations dimension 89–92; readings ship as metadata-only
  candidates; Mandarin carries brief-thinness P1s.
- **Fix:** fetch each candidate's abstract/first section; check topical
  entailment + license; promote candidate→verified or drop; deep-link
  the specific section. One more language-course prompt iteration for
  brief length.
- **Effort:** 1–2 days (network + parsing care). **Exit bar:** citations
  dimension ≥ 95 across four disciplines; Mandarin P1 = 0.

## Tier 3 — trust and standards (the honesty upgrades)

### 3.1 · Claim entailment: AUTHORED-GROUNDED means "supported by"

- **Finding:** a claim can cite a kernel and contradict it; nothing
  catches that today.
- **Fix:** one batched nano call per lesson verifying each claim against
  its cited kernel fact (entailment yes/no); mismatches downgrade to
  JUDGED and flag for repair. ≈ $0.005/course.
- **Exit bar:** 100% of AUTHORED-GROUNDED claims entailment-checked;
  mismatch rate reported per run.

### 3.2 · a2 as a build gate (stage 7c)

- **Finding:** the battery is $0 and has been run by hand four times.
- **Fix:** wire `profBridge` + the zero-token battery into the pipeline;
  catch/repair/exposure below bar become findings BEFORE render, exactly
  like J1–J11.
- **Exit bar:** a run whose a2 bars fail cannot render `ready`.

### 3.3 · Flywheel fact verification

- **Finding:** flywheel kernels are unverified model knowledge
  (provenance honest, epistemically weak).
- **Fix:** cross-family verification (a second model family checks each
  flywheel fact, batched ≈ $0.01) + the contribution round-trip the app
  already proved at v0.15.2.
- **Exit bar:** every flywheel fact carries verified/disputed status;
  disputed facts never ground AUTHORED-GROUNDED claims.

## Tier 4 — what quality claims can't cover until fixed

### 4.1 · Export parity (DOCX/PPTX)

- **Finding:** Trellis renders markdown; professors need real files.
  Every comparison to date is content-only, as disclosed.
- **Fix:** adapter mapping authored structures into the app's existing
  exporters (`deliverableExporters` is a façade — adapter work, never
  duplicate builders; fonts stay universally-installed per the export
  design system).
- **Exit bar:** a Trellis ZIP opens in Word/PowerPoint with the export
  torture sweep green.

### 4.2 · Multi-seat judging + the human anchor

- **Finding:** every judge number is one gpt-5.4-mini seat; every score
  is SIMULATED.
- **Fix:** 3-seat cross-family judge panels (needs the Anthropic/Google
  keys decision); and the sealed blind packet
  (`verification-output/trellis/human-blind-packet/`) returned by two
  instructors — the only item on this roadmap no pipeline change can
  substitute for.
- **Exit bar:** per-course means from ≥2 families; ANCHORED stamp rules
  per the constitution. **The pivot decision stays gated on this plus
  E2/E3/E5, regardless of how good the simulated numbers get.**

---

## Sequencing and budget

1.1 + 1.3 first (deterministic, free, closest bars) → 1.2 (kills the
catch/coherence trade at the source) → 2.1 (one $0.13 run answers it) →
3.2 (locks the bars as gates) → 3.1 → 1.4 → 2.2 → 3.3 → 4.1. Tier 1–3
measurement budget ≈ $3–5 of lean/draft runs plus the standing $0
batteries; 4.2's judge panels priced when keys land.

Standing rules carry forward: every number SIMULATED until anchored;
audits read artifacts, not scores (§5g's lesson); fix→run→measure with
ledgers on every run; residuals disclosed, never swallowed.

_— Fable 5_

---

## Status — implemented and validated (July 3, 2026)

All four tiers landed (generator `trellis@0.1.1`); the full validation
story, run table, exit-bar scorecard and the six lessons of the
convergence war are in `docs/TRELLIS_BUILD_REPORT.md` §5h. Headline:
cs-python run 9 meets 3 of 4 classroom bars (repair 0.769, catch ≥60%,
0 unexposed) at $0.179/99-A with 1 residual; the held-out
linear-algebra course does not yet meet the bars (repair 0.45) — the
refine loop is course-local and must run per discipline. Judge quiz
bar (≥8) and the $0.13 cost bar remain unmet with causes named
(corrective-append repetition; quiz output volume). 4.2 multi-seat
judging stays key-gated. Loop spend $3.16, all ledgered.
