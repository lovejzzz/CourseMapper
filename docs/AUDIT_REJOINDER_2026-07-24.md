# Rejoinder — What I Got Wrong, and the Number Neither of Us Had

**Date:** 2026-07-24
**Responding to:** [RESPONSE_TO_EXTERNAL_AUDITS_2026-07-24.md](./RESPONSE_TO_EXTERNAL_AUDITS_2026-07-24.md)
**Measured against:** `origin/main` @ `682b1484`, **V0.16.77**

---

## 1. The response is right about currency, and it's worse than it says

My local checkout was **281 commits behind `origin/main`**. I audited `6d4b3880` (July 16) believing it was HEAD. It was not. Every structural number I published was eight days stale, and the response's corrections are all confirmed:

| Metric                       | My audit (V0.16.39) | `origin/main` (V0.16.77) | Response claim |
| ---------------------------- | ------------------: | -----------------------: | -------------- |
| `courseBlueprintCompiler.js` |              23,631 |               **27,831** | 27,831 ✓       |
| `src/lib` flat modules       |                 173 |                  **221** | ~221 ✓         |
| npm scripts                  |                 153 |                  **377** | ~377 ✓         |
| release contracts            |                 225 |                  **262** | 263 ✓          |

That's on me — I should have checked `git fetch` before publishing. The correction is accepted without reservation.

**But look at the delta as a rate.** In the 8 days from July 16 to July 24, across 281 commits and 60 version bumps:

- **1,688 files added**, 333 modified
- compiler **+4,200 lines (+18%)**
- `src/lib` **+48 flat modules (+28%)**
- npm scripts **+224 (+146% — more than doubled)**
- +93 scripts, +56 evidence JSONs, +38 release contracts
- **62 weight binaries still tracked** — unchanged

The response says _"Agree strongly"_ to the compiler being too large and _"Agree"_ to release machinery dominating. In the same week, the compiler grew by 18% and the command surface grew by 146%. The diagnosis is shared; the trajectory hasn't turned. **That gap — not the absolute numbers — is the finding I'd keep.**

---

## 2. Where I was simply wrong

**The adapter program.** I wrote that nothing had been exposed to falsification. By V0.16.70 that was false. [`docs/evidence/SCION_V01670_ADAPTER_REJECTION_AND_RUBRIC_VALIDITY.json`](evidence/SCION_V01670_ADAPTER_REJECTION_AND_RUBRIC_VALIDITY.json) records a real 105,459,677-byte adapter, a paired five-domain held-out run, anonymous A/B plus reversed B/A review, and a documented rejection: no cross-domain win, 1.90× native generations, 2.81× runtime, over the 64 MiB budget.

That is exactly the experiment I said should be run — _"run one campaign to completion under the protocol that exists, before writing another protocol"_ — and it was run, and it produced a clean negative result. Corpus readiness is now `research-training-authorized` at 143/145 rows, not the 0/422 I measured on the superseded ledger.

**"Stop permanently" was too absolute.** The response is right. A negative result from a working evaluation apparatus is a different situation from no result at all. Freeze productization, keep the apparatus.

**The name.** "Scion Vx" for the system, "Scion Research Adapter" for the inactive experiment resolves the ambiguity I complained about. Conceded.

**And one thing the response is too modest about.** Buried in that same evidence file:

> `"summaryScoreFinding": "The deterministic 99/A score was saturated: it reported both arms as equal while complete learner-facing artifacts contained decisive factuality and instructional-quality differences."`

That is my audit's central finding, discovered independently, by your own instrument, on your own artifacts, before you read my report. It's stronger evidence than anything in my document because it emerged from a controlled comparison rather than an inspection. It belongs in the executive summary, not a JSON field.

---

## 3. The 91% figure: wrong unit, and the response's replacement is also incomplete

**My 91% was the wrong unit.** It counted duplicate instances inside compiled object graphs, including structural nesting a renderer collapses. I flagged the caveat but published the headline anyway. The response is right to reject it. Rendered artifacts are the correct unit.

**But 16.7% is an exact-duplicate rate, and exact matching cannot detect mail-merge by construction.** Substituting one noun makes two units "distinct." A template filled eight different ways scores 0% on that ruler.

The response's own P0 spec says so — step 3 is _"measure exact duplicates **and normalized 'skeleton' duplicates**."_ Only the exact number was reported. So I built the skeleton measure and ran it on **retained real production packages** from `origin/main` — not fixtures, not object graphs. Body text only; running headers and footers excluded; units of ≥8 words; course, lesson, and capitalised concept nouns masked before comparison.

### Results

| Package                                               | Lessons | Generated        | **Exact** | **Skeleton** |
| ----------------------------------------------------- | ------: | ---------------- | --------: | -----------: |
| `world-lit-package.zip`                               |      14 | Jun 13 (V0.15.x) |     17.3% |    **48.0%** |
| `2026-07-12-music-theory-scion-source-backed`         |       7 | Jul 12 (V0.16.x) |      7.6% |    **23.6%** |
| `2026-07-12-ux-design-studio-scion-compiler-hardened` |      12 | Jul 12 (V0.16.x) |      8.2% |    **24.0%** |

**Skeleton repetition runs ~3× the exact rate in every package.**

Per family, on the hardened UX package, the divergence is where the argument lives:

| Family             | Exact |  Skeleton | Ratio |
| ------------------ | ----: | --------: | ----: |
| Course FAQ         |  1.2% | **32.9%** |   27× |
| Discussion Prompts |  4.9% | **31.4%** |    6× |
| Assignment Briefs  |  5.7% | **32.1%** |    6× |
| Lesson Plans       | 15.2% |     35.1% |    2× |
| Quiz & Exam Bank   |  3.8% |     10.6% |    3× |
| Slide Decks        |  2.7% |     20.4% |    8× |

In the music-theory package, **Discussion Prompts score 0.0% exact and 27.9% skeleton.** A family that is flawless on the exact ruler is more than a quarter reused frames.

Representative frames, verbatim from the rendered files:

```
12x  model the weekly concept · mini-lesson · bloom: understand
12x  guided analysis · lecture exam · bloom: analyze
 7x  misconception polls with delayed correction: for «N», use misconception polls
     with delayed correction. for «N», direct…
```

**Conclusion:** the response's family ranking (Quiz highest, then Slides, FAQ, Lesson Plans) is an artifact of the exact ruler. On the skeleton ruler the ranking inverts — **Quiz & Exam Bank is the _least_ templated family at 10.6%, and Course FAQ and Discussion Prompts are the worst.** Fixing quizzes first, as the plan proposes, targets the family with the least room to improve.

---

## 4. The finding neither document has: it is already working

The three packages span two eras of this codebase.

|                              | Jun 13 · V0.15.x | Jul 12 · V0.16.x Scion |
| ---------------------------- | ---------------: | ---------------------: |
| Exact                        |            17.3% |            7.6% – 8.2% |
| Skeleton                     |            48.0% |          23.6% – 24.0% |
| Assignment Briefs (skeleton) |            73.5% |          22.8% – 32.1% |
| Rubrics (skeleton)           |            47.6% |          23.1% – 23.6% |

**Repetition roughly halved.** The model-plus-compiler architecture the response defends is not a hypothesis — it has already delivered a measured ~2× improvement in visible texture, and _no document in this repository records it_, because nobody had built the ruler.

**Caveat, stated plainly:** three packages, three different courses, three different scopes (14 / 12 / 7 lessons), two different compiler generations. This is suggestive, not controlled. The closest pair — world-lit (14) vs ux-design (12) — still halves on both measures, which is why I believe the direction is real. A controlled re-run on one frozen course across both compiler generations would settle it.

If that holds up, it is the single most important fact about this project, and it reframes everything: the argument is no longer _"is the compiler a mail-merge?"_ but _"the compiler was at 48% and is now at 24% — what gets it to 10%?"_

---

## 5. Ideas

### 5.1 Ship the skeleton ruler as the P0, not the exact ruler

The response's P0 is right in structure and would have been calibrated on the wrong metric. Land both rates; gate on skeleton. Concretely, the ruler needs to:

- read the **exported ZIP**, body text only, headers/footers excluded
- mask course, lesson, and capitalised concept nouns before hashing
- report exact **and** skeleton, per family **and** per package
- bind the ZIP SHA-256, compiler hash, and model route into the receipt
- start with the frozen V0.16.77 five-domain baseline, then ratchet

I have a working implementation validated on the three packages above. It is ~150 lines, needs no API key, and runs in seconds. Say the word and I'll land it as `scripts/visibleTextAudit.mjs` with the panel wired in.

**Ratchet it the way `checkBundleBudgets.mjs` ratchets bundle size.** That file is the best-run gate in the repo — a written justification per raise, measured before/after. Apply that exact discipline to texture and the quality problem becomes a budget problem, which this team has already proven it can hold.

### 5.2 Re-target the P0 content work

Reorder by skeleton rate, not exact rate:

1. **Course FAQ** (32.9%) and **Discussion Prompts** (31.4%) — worst frames, and both are small surfaces where a distinct-atom projection is cheap
2. **Assignment Briefs** (32.1%)
3. **Lesson Plans** (35.1%, but partly legitimate cross-surface alignment — needs the intentional/unintentional split first)
4. **Quiz & Exam Bank** — deprioritize; at 10.6% it is already the best family

The distinct-semantic-atoms design in §P0 of the response is, I think, exactly right. The measured evidence says point it somewhere else first.

### 5.3 The trajectory is the actual risk

Everything in §1 says the same thing: this project agrees with its critics and accelerates anyway. 146% script growth in the week you wrote _"release machinery is dominating the project."_

The 30-day plan has no mechanism to stop that, because it adds work without removing any. Two concrete brakes:

- **A budget, not an intention.** `npm scripts ≤ 380`, `release-contracts ≤ 265`, `courseBlueprintCompiler.js ≤ 27,831 lines` — as CI gates, today, at current values. Not reductions. Just _stop the growth_, using the ratchet mechanism already in the repo. Reductions come later; the first job is to make growth a decision rather than a default.
- **One release per shipped user-visible change.** 60 version bumps in 8 days is the engine driving contracts, evidence JSONs, and scripts. Every other symptom is downstream of it.

### 5.4 Two things I'd add to the plan

**Instrument the ruler on the adapter question too.** The V0.16.70 rejection found the 99/A score saturated. The skeleton ruler is a texture metric that isn't saturated — 24% has room in both directions. It would have given that comparison a real signal where the structural score gave none. Any future adapter candidate should be judged on rendered texture, not on 99/A.

**Get the weights out of Git before the history doubles again.** 62 binaries, ~1 GB, unchanged across 281 commits, with `fetch-depth: 0` on every CI run. The response defers this as P1 behind quality work. I'd invert it — not because it's more important than quality, but because it's the only item on the list that gets strictly more expensive every day it waits, and it's a half-day of work.

---

## 6. Where we actually stand

Of my two reports, the durable claims are:

- ✅ Structural gates measure structure, not teachability — **confirmed independently by your own V0.16.70 evidence**
- ✅ Rendered repetition is a real, concentrated defect — **confirmed, at 24% skeleton, not 91%**
- ✅ Repository weight and release machinery are drag — **confirmed, and accelerating**
- ❌ "91% of prose is repeated" — wrong unit, withdrawn
- ❌ "Zero AI calls in the shipping path" — that was the fixture path, withdrawn as a product claim
- ❌ "The adapter program has produced nothing" — outdated; a candidate was trained and honestly rejected
- ❌ "Stop adapter work permanently / rename Scion" — too absolute; the response's freeze-and-rename is better

And the one thing neither of us knew this morning: **visible repetition has already halved, and the architecture under dispute is the reason.**

The disagreement was never really about whether the compiler is good. It's about whether you can see what it's doing. Now there's a ruler.
