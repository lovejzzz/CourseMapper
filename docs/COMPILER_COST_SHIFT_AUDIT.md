# Compiler Cost-Shift Audit — what moves from model spend to compiler code

**Date:** June 2026 (post-v0.9.1)
**Question:** Which tokens are we paying the model to write that the deterministic
compiler could produce without quality loss?
**Method:** Traced every model call's actual output contract against existing
compiler capability; measured real output from the V09 production courses.

---

## 1. Where every API token goes today (v0.9.1, 14-lesson course)

| #   | Call                                                  | Count                     | Input (est.)     | Output (est.)                | Notes                                                                                                               |
| --- | ----------------------------------------------------- | ------------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Course-map generation (`prompts.js` verbose contract) | 1 (+continuations)        | 8–30k (syllabus) | **~9–10k**                   | Measured: 30,139 chars of rendered cell prose in the Social Policy map = ~7.5k tokens, plus JSON structure overhead |
| 2   | Examine pass (`EXAMINE_SYSTEM_PROMPT`)                | 0–1, trigger-gated        | 5–35k            | 0.5–1.5k                     | Already focused (v0.8.6) — only flagged lessons sent                                                                |
| 3   | Course-level blueprint enrichment                     | 0–1                       | ~2.5k            | ~0.6–0.9k                    | `lessonPhrases` output scales with lesson count                                                                     |
| 4   | Per-lesson content enrichment (v0.9.1)                | ⌈N/2⌉ = 7                 | ~12k (7 × ~1.7k) | **~14–17k**                  | Now the largest output spend in the pipeline                                                                        |
| 5   | All 9 deliverables                                    | **0**                     | 0                | 0                            | `BLUEPRINT_COMPILED_FEATURES` covers everything                                                                     |
| —   | **Hidden: reasoning tokens**                          | every OpenAI gpt-5.x call | —                | **+30–70% of billed output** | No `reasoning.effort` is ever sent (see §2.1) — server defaults to _medium_                                         |

Total billed output ≈ **24–29k tokens/course**, plus invisible reasoning tokens
on the default OpenAI path.

---

## 2. The shift catalog (ranked: savings × risk)

### 2.1 ⚡ Send explicit reasoning effort — the hidden tax (zero code risk, biggest real-world lever)

**Finding.** `modelCapabilities.js` sets `applyByDefault: false` on every
reasoning profile, and no `generationPlan` ever sets `reasoning.enabled`. So
`buildOpenAIResponsesBody` (openaiProvider.js:41) **omits the `reasoning` field
entirely** on every call. On the Responses API, gpt-5.x models then default to
**medium reasoning effort server-side**, and reasoning tokens bill as output.
For JSON transcription/extraction tasks this can exceed the visible output.

**Shift.** Always send an explicit effort, tiered by task:

| Task                                   | Effort          | Why                                               |
| -------------------------------------- | --------------- | ------------------------------------------------- |
| `course-map`                           | `medium` (keep) | genuine structure inference from messy syllabi    |
| `blueprintEnrichment` / lesson content | `low`           | constrained JSON authoring against a fixed schema |
| `examine` / `repair` / gap-fill        | `low`           | patch emission against explicit rules             |

**Mechanism.** Replace the boolean `highValueTasks` gate with a
`taskEffortMap` in the capability profile; `createReasoningRequestControl`
returns `enabled: true` with the mapped level for every task on
reasoning-capable models. ~20 lines in `modelRequestBuilders.js` +
`modelCapabilities.js`.

**Quality guard.** None of these tasks benefits from deep deliberation — they
are schema-following tasks; the per-item lints and gold gates are the actual
quality mechanism. Verify with one before/after generation on the 4 audit
syllabi.

**Savings: the entire hidden reasoning bill on enrichment/repair calls — often
30–60% of real OpenAI spend.** This is a pure pricing fix; zero output change
expected.

### 2.2 ⚡ Flip lean course-map atoms ON (the v0.8.6 investment that was never collected)

**Finding.** Lean mode is **fully built and fully wired** — `LEAN_COLUMN_DEFS`,
`LEAN_SYSTEM_ADDITION`, `expandLeanCourseMap` (idempotent, continuation-safe),
prompt support in `buildUserPrompt({lean})`, expansion at useGeneration.js:985
and 1043. But `generationPlan.leanCourseMapAtoms` is **set by nothing** —
grep finds zero writers. Every production course map pays the verbose contract.

**Shift.** Set the flag in the generation plan (modelCapabilities.js, where
`courseMapOutputTokens` is computed) for capable models, prove on the gold
suite + copy-variety budget, then default-on.

**Quality guard.** The expansion renders the _same_ downstream contract
(stems, numbering, labels) that validators, the blueprint compiler, and
exports already consume. Atoms force _more_ specificity per phrase, not less
("Terse but concrete beats long and generic" is already in the contract).
Gates: `audit:gold` 40/40, blueprint matrix, `audit:deliverables`.

**Savings: ~40–55% of call #1's output (~4–5k tokens/course)** — stems,
numbering, list scaffolding, and sentence padding move into `expandLeanCourseMap`.

### 2.3 Drop compiler-owned columns from the model contract entirely

**Finding.** Three columns the model writes are derivable, and one is pure
self-talk:

- **`evaluateDesign`** — measured as the _longest cells in the real output_
  (the top 3 cells in the Social Policy map are all 380+ char alignment
  self-checks). The blueprint already computes objective↔assessment↔activity
  alignment deterministically (alignment matrices, `trace_objective`). Paying
  a model to write prose _about_ alignment the compiler _verifies_ is the
  definition of waste. ~15–18% of all cell text.
- **`presentationFormat`** — a short label the compiler can decode from
  modality + activities (it already validates "never blank" and has fallbacks).
- **`technologyNeeded`** — mostly modality boilerplate (LMS + Zoom + Docs).
  The sparse-repair machinery already synthesizes it with `compiler-inferred`
  provenance.

**Shift.** In lean mode, remove all three from the requested contract.
Compiler synthesizes them with provenance marks. For technologyNeeded, keep an
optional `specialTools` atom array so source-mentioned tools (SPSS, Logic Pro,
GIS) are never lost — the model emits it _only_ when the syllabus names tools.

**Quality guard.** evaluateDesign: compiled from the actual alignment matrix —
_more_ truthful than model prose (it can cite the real mapping instead of
asserting one). Provenance: `compiler-inferred`, surfaced in trust records.
Existing local-review gates stay.

**Savings: another ~20–25% of call #1 (~2k tokens/course)** on top of §2.2.

### 2.4 Compact keys for the lesson-content enrichment contract

**Finding.** The repo already owns this idiom — `keyMaps.js`: "AI prompts
request abbreviated keys… ~15–20% output reduction… expandKeys() restores full
names." The v0.9.1 enrichment contract ignores it: `distractorRationales`,
`taskDescription`, `scoringGuidance`, `discussionPrompt` are spelled out in
every item of every lesson of every chunk.

**Shift.** Add an `enrichment` map to keyMaps.js (`q`/`op`/`ai`/`dr`/`ex`/`sg`,
`t`/`d`/`eg`/`mc`, …), request short keys in the schema, `expandKeys` in
`parseLessonContentEnrichmentResponse` before linting. Lints unchanged.

**Savings: ~15–20% of call #4's output (~2.5–3k tokens/course).** Risk ≈ zero.

### 2.5 🏆 The knowledge-kernel restructure — the "super-power compiler" move

**Finding.** The per-lesson contract asks for **five finished surfaces** and
pays for the same disciplinary knowledge two or three times:

- `keyTerms[].misconception` and `quizItems[].distractorRationales` encode the
  _same misconceptions_ in different prose.
- `slideContent[].bullets` restate the facts that `quizItems[].explanation`
  states.
- `slideContent[].notes` (2–4 sentences × 3) restate the bullets — and the
  compiler already has `slideNotes()` (courseBlueprintCompiler.js:14353) that
  builds speaker notes deterministically.
- `scoringGuidance` re-derives criteria the compiler frames anyway.

**Shift.** Restructure the contract from _surfaces_ to a per-lesson
**knowledge kernel** — the model writes knowledge atoms ONCE; the compiler
projects them into every artifact:

```
kernel: {
  facts:    [5–8 one-line content-bearing claims],
  terms:    [4 × {term, definition, example, misconception}],
  scenario: {setup, materials}            // one concrete case/dataset/text
  tension:  {question, positions[2–3]}    // the genuinely debatable issue
  task:     {description, parameters[]}   // what students actually produce
  mc:       [3–4 × {stem, options[4], answerIndex}]  // irreplaceable authorship
}
```

Compiler projections (all existing machinery):

- **Slides** ← assertion titles + evidence bullets from `facts`; notes from
  `slideNotes()` over facts (drop model-written notes).
- **Quiz MC** ← `mc` items; **distractor rationales** ← matched `terms[].misconception`;
  **explanations** ← the supporting `facts` entry.
- **Short answer / essay** ← compiled frames around `scenario` + `facts`
  (the v0.9.1 overlay pattern, inverted: compiled stem, model substance).
- **Discussion** ← `tension`. **Assignment** ← `task`.
- **Study guide** ← `terms` (misconceptions reused, not re-bought).

**Why this is the flagship.** It cuts the per-lesson output roughly in half
(~2,000–2,200 → ~1,100–1,300 tokens) **and raises quality**: every artifact
draws from the same kernel, which is exactly the cross-artifact coherence the
CCR rubric scores (D1 alignment, D3 substance spiral). One source of truth per
lesson also makes the substance audit and the TA's `trace_objective` sharper.

**Quality guard.** Same per-item lint + individual-fallback architecture as
v0.9.1 (lint the kernel atoms, not just surfaces); `auditSubstance` ≤5% meta
target unchanged; CCR judge re-scores D2/D3 on the first kernel generation.

**Savings: ~40–50% of call #4 (~6–8k tokens/course), stacking multiplicatively
with §2.4's key compaction.**

### 2.6 Absorb the course-level enrichment call

**Finding.** Call #3's `lessonPhrases` (one entry per lesson — output scales
with course length) is largely superseded by per-lesson content enrichment;
`lens` has a deterministic fallback (`inferDisciplineLens`); `teachingMoves`
has compiled defaults. A whole network round-trip + system prompt for ~700
tokens of mostly-derivable content.

**Shift.** Fold `lens`, `signatureTerms`, and `styleNotes` into chunk #1 of the
lesson-content call (one extra schema block, ~150 output tokens). Derive
`lessonPhrases` deterministically from `topicSection` first-phrase extraction
(the finalizer's `topicShort` machinery) for kernel-enriched lessons; keep the
standalone call only as the adaptive fallback when lesson-content enrichment is
off.

**Savings: one full call — ~2.5k input + ~0.7k output — and removes the
per-lesson output scaling.**

### 2.7 Bigger enrichment chunks + cache-aligned prompt layout

**Finding.** The static prefix (system prompt + schema + item plan ≈ 900
tokens) is re-paid in all 7 chunks = ~6.3k input/course. Anthropic gets
`cache_control` (modelRequestBuilders.js:229) — good — but OpenAI's automatic
prefix caching needs ≥1,024 identical leading tokens, and the current layout
puts `Course:` + lesson data _before_ nothing reusable in `input`.

**Shift.** (a) chunk size 2 → 4 with `maxOutputTokens` scaled (~4.8k/call):
7 calls → 4 for a 14-lesson course. (b) Move everything static into
`instructions` (system) and keep only the lesson array in `input`, so the
OpenAI cached-prefix covers system+schema across chunks. (c) Keep the
truncation canary; per-item fallback already bounds the blast radius of a
truncated chunk.

**Savings: ~3–4k input tokens/course + per-call overhead; cache discounts on
the rest.** Risk: low (parse failures degrade per item, not per chunk).

### 2.8 Trim the examine pass's syllabus payload

**Finding.** Focused review (v0.8.6) trims _lessons_ but still ships up to
30,000 chars of syllabus. `segmentSyllabus()` already maps segments to lessons.

**Shift.** When `focusLessonIndices` is set, send only the matching syllabus
segments (+ header segment). Saves up to ~5–7k input tokens on triggered runs.
Risk: low — same segmentation the generator used.

---

## 3. What must NOT shift (the quality line)

The compiler must never fabricate **disciplinary knowledge**. Keep model
authorship for: MC stems and option sets, term definitions, facts, the
scenario, the debatable tension, and the assignment task. Specifically:

- **No deterministic distractor generation** (negating/permuting the key
  produces transparently wrong options — instant CCR D2 fail).
- **No template essay prompts without a model scenario** — compiled frames
  around model substance (the v0.9.1 pattern) is the floor.
- Lean atoms still come from the model reading the syllabus — lean mode
  compresses _form_, never _sourcing_.

## 4. Cost model: before → after (14-lesson course, all shifts)

| Call                      | Today (out)             | After (out)                                   |
| ------------------------- | ----------------------- | --------------------------------------------- |
| Course map                | ~9–10k                  | **~3.5–4.5k** (lean + dropped columns)        |
| Course-level enrichment   | ~0.7k                   | **0** (absorbed)                              |
| Lesson content            | ~14–17k                 | **~6.5–8k** (kernel + compact keys, 4 chunks) |
| Examine (when triggered)  | ~1k                     | ~1k (input −5–7k)                             |
| Hidden reasoning (OpenAI) | +30–70%                 | **≈ 0** (explicit low effort)                 |
| **Total billed output**   | **24–29k (+reasoning)** | **~11–13.5k**                                 |

**≈ 55–60% reduction in billed output tokens — and on the default OpenAI
path, total spend drops further once the silent medium-reasoning default is
gone. Per-course cost roughly drops from ~$0.50–2 to ~$0.20–0.80.**

Quality moves _up_, not sideways: §2.3 replaces asserted alignment with
computed alignment; §2.5 gives every artifact one kernel of truth per lesson.

## 5. Recommended order

1. **§2.1 reasoning effort** + **§2.4 compact keys** — two small PRs, zero
   contract risk, immediate savings.
2. **§2.2 lean default-on** behind the existing gold/copy-variety gates, then
   **§2.3 dropped columns** as a second lean iteration.
3. **§2.5 kernel restructure** + **§2.6 absorbed course-level call** +
   **§2.7 chunking/caching** as one release (they touch the same contract).
4. **§2.8 examine trim** anytime.

Gates for every step: unit + blueprint matrix + `audit:gold` + `audit:deliverables`

- bundle budgets locally before push (standing rule), `auditSubstance` ≤5% meta
  on enriched output, CCR judge re-score on the first post-change generation.
