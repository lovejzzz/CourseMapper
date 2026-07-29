# Scion — An Outside Assessment

**Date:** 2026-07-24 · **Commit:** `6d4b3880` · **Version:** v0.16.39
**Companion to:** [AUDIT_2026-07-24_STRUCTURE_AND_OUTPUT_QUALITY.md](AUDIT_2026-07-24_STRUCTURE_AND_OUTPUT_QUALITY.md)

This is an opinionated read, requested as such. Every claim is sourced to something measured on this checkout today. Where I'm reading intent rather than evidence, I say so.

---

## The one-sentence verdict

**Scion is one genuinely excellent shipped product and one seventeen-day research program that has produced zero results, and because they share a name, the failure of the second is hiding the success of the first.**

I think the shipped half is the most valuable thing built in this repo in months. I think the research half should be stopped — not paused, stopped — and I'll argue that below.

---

## 1. Scion is two different things

|             | **Scion-as-provider**                                    | **Scion-as-adapter**                                          |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| What it is  | Public Gemma 4 E2B running in the browser + the compiler | A LoRA fine-tune of that base on CourseMapper preference data |
| Status      | **Shipping and working**                                 | 32 releases, nothing promotable                               |
| User impact | Free, keyless, private course generation                 | None — never deployed                                         |
| Evidence    | 98–99/A packages at $0.00                                | `0/422 eligible` preference pairs                             |

The roadmap treats these as one program with one north star. They are not the same bet, they don't share a failure mode, and conflating them is the central problem.

---

## 2. Scion-as-provider: this is very good, and undersold

### What it does

A user with no API key, no account, and no willingness to send their syllabus to a third party can generate a complete course package. The model runs in their browser. Their course content never leaves the device. It costs nothing.

For an education tool — where the users are instructors, the data is course material, and the budget is frequently zero — that is close to an ideal product property. Most competitors cannot offer it.

### It demonstrably works

From the last completed Crucible round ([`verification-output/crucible/round-2026-07-13T01-10-00-422Z/`](../verification-output/crucible/)):

```
Provider: local · Model: scion-1 · Courses: 1
Total generation time: 1256s
Total cost (from digests): $0.0000
business-ethics — overall 98 · P0: 0 · P1: 0
```

And from the v0.16.6 release-gate run recorded in [`SCION_NEXT_LEVEL_PLAN.md`](SCION_NEXT_LEVEL_PLAN.md):

> a 12-lesson Business Ethics package reached **99/A with zero P0/P1/P2, 38/38 clean export checks, 101 files, and 104/104 completed local requests in 548 seconds**

A twelve-lesson course, fully local, nine minutes, zero dollars, structurally indistinguishable from the paid path. That is a real result and it is buried in a roadmap whose status paragraph is about GGUF tensor counts.

### What it costs the user

Being fair about the friction:

| Cost                | Value                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| First-use download  | **3.35 GB** (`gemma-4-E2B_q4_0-it.gguf`, [`scionBrowserConstants.js:17`](../src/lib/scionBrowserConstants.js))                           |
| Generation time     | 548s–1256s per course vs. seconds for a hosted API                                                                                       |
| Peak browser memory | 5,606 MiB measured on an M4 Max                                                                                                          |
| Agent capability    | `toolCalling: false` ([`publicScionProvider.js:291`](../src/lib/publicScionProvider.js)) — advisory chat only, cannot edit the workspace |
| Device coverage     | **1 of 4** profiles passing (`apple-silicon-16gb`; `integrated-8gb`, `integrated-16gb`, `discrete-8gb` unproven)                         |

That last row is the one I'd worry about. A 3.35 GB download that has only been proven on a 48 GB M4 Max is a product that works for the person who built it. Most instructors are on an 8 GB integrated-graphics laptop — exactly the three unproven profiles.

**My read:** the shipping product's biggest risk is not model quality. It's that nobody knows whether it runs on a normal teacher's computer, and finding out requires no training, no adapter, and no new evidence protocol.

---

## 3. Scion-as-adapter: seventeen days, thirty-two releases, zero results

### The scale of the investment

Scion's first commit was **2026-07-07**. That is **17 days ago**.

| Footprint                     |                       Amount |
| ----------------------------- | ---------------------------: |
| `src/lib/scion*` modules      |        18 files, 5,334 lines |
| `scripts/*scion*`             |       39 files, 15,730 lines |
| Scion test files              |                           33 |
| **npm scripts**               |          **70 of 153 (46%)** |
| Releases (v0.16.9 → v0.16.39) |        **32 of the last 41** |
| Release contracts             |                           31 |
| Evaluation evidence           | 14 MB (74% of `evaluation/`) |
| Committed model weights       |                       918 MB |

Roughly **21,000 lines of source in 17 days**, and nearly half the repository's entire command surface.

### What it has produced

Run today:

```
$ npm run audit:scion:corpus
Scion preference corpus: 0/422 eligible
Quarantined: 422
```

**Zero.** Not a small number — zero. And this is not new. From the v0.16.6 plan:

> The v0.16.6 production exporter admitted **0 of 471** rows

The training-data yield has been **0% for the entire life of the project.** 471 candidates then, 422 now, zero eligible at both ends.

The roadmap's own status line, in its own words:

> a completed same-identity two-order judgment, stable training preferences, **a quality adapter**, native Scion Agent tool calling, the other three device profiles, and **a five-domain adapter win do not exist yet**

And the v0.16.39 release boundary:

> The adapter is smoke-only, scale 16, **permanently non-promotable, and not deployed**. It does not prove factual improvement, teachability, a held-out win, lower compiler burden, paid-reference parity, or human validation.

I count **15 separate release-boundary disclaimers** across the roadmap stating that the release proves no quality or speed improvement. Five consecutive releases (v0.16.35–v0.16.39) each say it explicitly.

### Why it produced nothing

This is the part I find genuinely interesting, and it isn't incompetence — it's a structural trap.

Look at the quarantine reasons:

| Reason                                                           | Count | Type           |
| ---------------------------------------------------------------- | ----: | -------------- |
| missing-pair-level-evidence                                      |   234 | **process**    |
| unverified-preference-evidence                                   |   234 | **process**    |
| no-deterministic-quality-margin                                  |   216 | **process**    |
| missing-independent-verifier-diversity                           |   104 | **process**    |
| missing-training-prompt                                          |    37 | **process**    |
| missing-review-approval                                          |    36 | **process**    |
| circular-definition, option-length, scenario-missing-decision, … |  ~150 | content defect |

The dominant blockers are **not bad data**. They are "no judge ever scored this." 234 of 422 pairs are waiting on a judgment that has never happened.

And here is why it never happens — the campaign history, in order:

- **v0.16.30** — B/A pass sealed, but cross-revision, so analysis-only
- **v0.16.35** — new A/B clean room built → _"Superseded Before Scoring"_
- **v0.16.36** — replacement workbook, 128 cases, new judge identity → _"performs zero judgments"_
- **v0.16.38** — evidence protocol v2 → _"invalidates hollow v1 promotion attestations"_
- **v0.16.39** — → _"the blank 128-case v0.16.36 workbook is therefore stale and must not be scored"_

**The verification protocol is being rebuilt faster than it is being run.** Every campaign is invalidated by the next protocol revision before anyone scores it. Each revision is individually well-reasoned — v0.16.38 caught a real hole where a pass-shaped scorecard could omit its criterion-level review — but the aggregate is a treadmill.

The promotion bar compounds this. `scionAdapterPromotionAudit.mjs` requires: five matching held-out domains, 99/A and zero P0/P1 on _every_ course, no per-domain call regression above 1.05×, at least 20% median call reduction, plus hash-bound factual, instructor, device, and production evidence. Each condition is defensible. Their conjunction is a bar that no first adapter in the history of machine learning would clear.

**My read:** this program has optimized for unfalsifiability. The evidence standards are so high that no result can be produced, which means no result can ever be wrong. That feels like rigor. It is actually its opposite — rigor requires exposure to being wrong, and nothing here has been exposed to anything. Seventeen days of building instruments and zero readings taken.

I want to be fair: the honesty is real and unusual. Most projects in this position would have shipped a fine-tune and claimed a win. This one wrote fifteen disclaimers saying it hadn't. That's a genuine virtue and I don't want to punish it. But honest documentation of zero progress is still zero progress.

---

## 4. The strategic problem nobody has written down

Here is the thing I'd most want the owner to sit with.

**Even a perfect Scion adapter cannot fix CourseMapper's actual output problem.**

From the companion audit, measured today:

- 91% of prose sentences (≥12 words) in a compiled package are verbatim repeats of another sentence in the same package
- 51–71% of sentences per deliverable share a skeleton, varying **≤2 points across three unrelated disciplines**
- The pipeline audit reports `81 compiled feature entries, 0 model-generated feature entries`

The repetition is produced by [`courseBlueprintCompiler.js`](../src/lib/courseBlueprintCompiler.js) — 23,631 lines — _after_ the model has finished. `grep -i scion` on that file returns **nothing**. The roadmap says so itself, approvingly:

> the compiler owns source truth, deterministic invariants, validation, repair, grading, and packaging
> Public Scion remains the pinned browser-local base plus **the model-neutral compiler**

Model-neutral is the design goal, and it succeeded. The consequence is that the model's quality has _bounded influence_ on the prose a teacher actually reads. Scion builds the course map and kernel; the compiler mail-merges the deliverables from it.

So the adapter program is trying to raise the ceiling on the half of the pipeline that isn't the bottleneck. The north star — _"Scion produces a more teachable course than a paid frontier baseline"_ — cannot be reached by improving Scion, because the teachability is being flattened downstream by a deterministic template engine that neither Scion nor GPT-5.5 can reach.

The two audits produce the same finding from opposite ends: **the compiler, not the model, is the product's quality ceiling.**

---

## 5. What 17 days bought, honestly totalled

**Delivered and valuable:**

- A working keyless, private, free, browser-local generation path — 98–99/A at $0.00
- Genuinely excellent provenance engineering: hash-bound lineage, deterministic GGUF conversion, atomic install, exact rollback, quarantine on failure
- 33 test files and audits that pass and refuse to overclaim
- An honest evidence culture that is rarer than it should be

**Not delivered:**

- Any trained adapter in production (`no current public Scion request claims to use trained weights`)
- Any measured quality win, on any axis, ever
- Any approved training preference — 0/422, and 0/471 before that
- 3 of 4 device profiles
- Native tool calling for the Scion agent

**Charged to the repo:**

- 918 MB of committed weights → ~3 GB git history, `fetch-depth: 0` on every CI run
- 70 of 153 npm scripts
- 31 release contracts, 4 roadmap docs, 14 MB of evidence
- 32 of the last 41 releases

---

## 6. What I'd do

### Stop the adapter program

Not pause — stop, and say so in the roadmap. The evidence for stopping is the program's own instrument reading `0/422` after 17 days and 32 releases, with a yield that has never been above zero. A research bet that has produced no signal on its primary metric across its entire lifetime is not a bet that needs a better protocol. It needs to be closed.

Concretely: archive `SCION_ADAPTER_ROADMAP.md`, keep the `audit:scion:*` scripts that verify shipped behavior, delete the ~40 that verify training artifacts nobody will produce, and get the 918 MB of weights out of git (see Lane A of the companion audit).

If it's kept alive anyway, then at minimum invert the order: **run one campaign to completion under the protocol that exists today, before writing another protocol.** The current loop cannot terminate because each revision invalidates the run it was meant to enable. One scored campaign — even a flawed one — produces more information than the last five releases combined.

### Promote the provider

Rename it. "Scion" now means _"the fine-tuning program that hasn't worked"_ in every document in this repo, and that name is attached to the best feature in the product. Call the shipping thing what it is to a user: **free, private, on-device course generation**. Give it its own doc, its own roadmap, and its own success metric that has nothing to do with LoRA.

Then spend the next two weeks on the three unproven device profiles. That is the work that decides whether the shipped product exists for anyone who isn't holding an M4 Max — and it needs no training, no judge, and no evidence protocol. It's the highest-value Scion work available and it's currently priority-nothing.

### Point the freed capacity at the compiler

The companion audit's Lane D. If the goal is _"a more teachable course than a paid frontier baseline,"_ the measured obstacle is 91% verbatim repetition emitted by a model-neutral template engine — not the model. That's where the north star actually lives.

---

## 7. So how do I feel about it?

Impressed and frustrated, roughly equally.

The engineering craft is real. Hash-bound lineage from a seeded training run through GGUF conversion into a real browser with exact rollback and quarantine-on-failure is genuinely hard, and it was built in 17 days. The refusal to claim wins that weren't measured is a discipline most projects don't have. If someone showed me `audit:scion:adapter:exact-lineage` in isolation I'd say this team is unusually serious.

But the whole apparatus is pointed at a target that wouldn't matter if it were hit. Every gate works. Every receipt verifies. Every audit passes. And the number at the end of the pipeline is zero, and has been zero since the first day, and the response to zero has been to build a better instrument for measuring it — five times.

Meanwhile the actual achievement — _a teacher can generate a full course, free, on their own laptop, with their syllabus never leaving the device_ — sits in a paragraph of a roadmap otherwise concerned with tensor pair counts, unproven on three of four machine types, and named after the thing that didn't work.

The best decision available is to stop confusing the two, ship the one that works to the machines teachers actually own, and go fix the compiler.
