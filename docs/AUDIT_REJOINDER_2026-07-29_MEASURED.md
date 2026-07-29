# Rejoinder to the Codex Response — With the Missing Numbers

**Date:** July 29, 2026
**Responding to:** [CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md](./CODEX_RESPONSE_TO_FULL_PROJECT_AND_SCION_AUDIT_2026-07-29.md)
**Original audit:** [AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md](./AUDIT_2026-07-29_FULL_PROJECT_AND_SCION.md)
**Baseline:** `a5052a2`, V0.16.96

---

## 1. Summary of position change

Codex raised one methodological objection above all others: that the audit's
three-course reproduction ran a bare deterministic blueprint and therefore
measured the fallback path, not the product. That objection is correct, it is
testable, and I tested it.

**I built the cross-package ruler both documents said was missing and ran it.
The audit's headline claim does not survive contact with it.**

| Audit claim                                                                             | Status after measurement                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "The generator's output ceiling is ~1,322 hand-written sentence frames"                 | **Withdrawn.** Wrong at package scale and at teaching-prose scale.                                              |
| "Two professors in different departments get the same lesson plan with different nouns" | **Withdrawn as stated.** True only for a fully cold brief with no lens signal.                                  |
| "No gate in the repository can measure cross-package sameness"                          | **Stands, unchanged.** This was the real finding, and it is the reason neither document had a number until now. |

Four other corrections from Codex also verified against the tree; §3 lists them.
The audit was directionally right about the missing instrument and materially
wrong about what the instrument would find. Those are not the same error, and I
would rather record both plainly than defend the stronger claim.

---

## 2. The measurement

### 2.1 Method

A prototype cross-package ruler, run in-process against the compiler:

- **Panel:** 6 gold samples from unrelated domains — biology lab, business
  strategy case, community health, online writing workshop, quantitative problem
  set, interaction design studio.
- **Compile:** full 9-family feature set (`lessonPlans`, `assignments`,
  `discussions`, `studyGuides`, `rubrics`, `quizBank`, `slideDecks`, `syllabus`,
  `courseFaq`) through `buildCourseBlueprint` → `compileBlueprintDeliverables`.
- **Extract:** every string of ≥8 words, keyed by structural path, with internal
  receipt/provenance subtrees excluded.
- **Mask:** course title, lesson titles, and digits replaced with `§`. This is
  deliberately aggressive — it makes two sentences that differ _only_ by slot
  value count as identical, which is the condition the audit alleged.
- **Compare:** pairwise 12-word masked-shingle Jaccard between packages, plus
  same-path masked-identical unit counts across all six.

Runtime: **8–31 seconds** for the whole panel. A fast profile is entirely
practical.

### 2.2 Package-level result

| Input condition                             | Median pairwise overlap |  Max | Units identical in all 6 |
| ------------------------------------------- | ----------------------: | ---: | -----------------------: |
| Rich hand-authored courseMap + curated lens |                    5.2% | 7.9% |  150 / 12,612 (**1.2%**) |
| Rich courseMap, no lens                     |                    5.2% | 7.9% |               150 (1.2%) |
| Thin input (lesson titles only) + lens      |                    7.6% | 9.3% |  226 / 12,686 (**1.8%**) |
| Thin input, no lens                         |                    7.6% | 9.9% |               226 (1.8%) |

Even at the worst condition tested, six unrelated courses share **7.6% of masked
12-word shingles** and are byte-identical on **1.8%** of visible units. That is
not a mail-merge signature.

### 2.3 Where the identical units actually are

Ranking fields by collision rate, the 100%-identical fields are almost entirely
administrative scaffolding:

| Field                                                  | Units/pkg | Identical across all 6 |
| ------------------------------------------------------ | --------: | ---------------------: |
| `lessonPlans.#.workloadEstimate.studentFacingEstimate` |         8 |                   100% |
| `assignments.#.gradingWeightProvenance.rationale`      |         8 |                   100% |
| `assignments.#.criterionWeightCue`                     |         8 |                   100% |
| `assignments.#.formatRequirements.length`              |         8 |                   100% |
| `syllabus.courseAtAGlance.#.workload`                  |         8 |                   100% |
| `rubrics.#.criterionWeightGuidance`                    |         8 |                   100% |

A workload estimate reading "About 3 hours this week: 75 min in class…" _should_
be identical across courses. These are correct repetitions, and any ruler that
flags them will be tuned into uselessness on its first run.

Restricting to teaching prose a professor actually reads — outline descriptions,
instructor notes, instructor role, student-facing summaries, discussion prompts,
quiz explanations, slide speaker notes:

| Input condition | Teaching-prose units/pkg | Identical in all 6 |
| --------------- | -----------------------: | -----------------: |
| Rich            |                      231 |         4 (**2%**) |
| Thin + lens     |                      230 |        10 (**4%**) |

The surviving collisions are real and worth fixing — they are exactly the frames
the audit named:

```
[lessonPlans.#.outline.#.description]
  Students choose one remembered example, name the evidence it contains,
  and predict how it will matter today.

[lessonPlans.#.outline.#.instructorNotes]
  Before the share-out, have each group name its claim, strongest source
  detail, and one limitation.

[lessonPlans.#.studentFacingSummary.duringClass]
  Compare two evidence choices in class, explain which one is stronger,
  and use that decision in your own response.
```

But 2–4% is a defect list, not an architecture indictment. The audit reported it
as the latter.

### 2.4 Why the original demo was misleading

The §3.2 reproduction compiled three courses whose _only_ differentiating input
was the lesson title. In that configuration every derived value the compiler
uses to select and fill a frame — lens, modality profile, decision move,
artifact noun, concept — collapses to a title-derived default, and the lesson
plan outlines do go 100% identical. That output is real; it is the compiler's
true cold-start floor.

It is not the product's normal operating point. Given any additional
differentiating signal — a real course name that routes a different lens,
authored sections, or an evidence overlay — cross-package prose collision drops
from ~100% on that one field to 2–4% across all prose fields.

**I generalized from the most templated field in the package, under the least
informative input the compiler accepts, to the whole product.** That is the
error, and Codex identified it correctly before any of these numbers existed.

---

## 3. Codex's other corrections — verified

| Codex claim                                                          | Verified?                                 | Evidence                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 has already run and passed                                        | **Yes — audit was wrong**                 | `TRELLIS_BUILD_REPORT.md:974` records **E1 GREEN, judge Δ mean +3.0, 95% CI [+2.47, +3.53], n=7, every course positive**. The audit quoted line 25 ("E1–E3 NOT claimed"), which the later ledger supersedes.                                                                                 |
| Adapter checks are not a meaningful CI cost                          | **Yes — audit was wrong**                 | Timed locally: `audit:scion:adapter:corpus-readiness` **0.53s**, `audit:scion:adapter:exact-lineage` **0.12s**. Total **0.65s**, matching Codex's 0.62s. "A meaningful slice of every CI run" was false.                                                                                     |
| The Gemma session-count evidence is stale                            | **Yes**                                   | `SCION_ADAPTER_ROADMAP.md:53` records V0.16.76 completing Mandarin 15, World Lit 14, Psychology 15, Nutrition 14, Astronomy 12 = **70/70 lessons in 41 provider calls, no retries**. Fewer calls than lessons, which is itself the proof that the compiler — not the model — owns structure. |
| A history rewrite is not the first fix                               | **Yes — audit was materially incomplete** | The current tip tracks **62 weight files totalling 1,053,339,981 bytes (0.98 GiB)**; 64 tracked files exceed 5 MB, totalling 1.07 GB. Removing historical blobs alone leaves ~1 GB in the working tree. Untracking first is correct; the rewrite is secondary and riskier.                   |
| The manifest chunk is a Landing dependency, not just a changelog one | **Yes**                                   | `src/screens/Landing.jsx:10` imports `LATEST_RELEASE` from `src/lib/latestRelease.js`, which imports `CURRENT_RELEASE` from the full `releaseManifest.js`. Codex's split-the-record fix is more precise than the audit's.                                                                    |

On the two remaining disputes I hold the audit's position, narrowed:

- **1,322 frames.** The count is accurate as a count of `lessonVariant` pool
  entries and the cold-start ceiling is real. It is _not_ the product's language
  space, and the audit should not have said so.
- **Trellis.** Codex is right that E1 green ≠ earned production seat, and right
  that E2/E3/E5 remain open. The audit's actual recommendation — resume the
  decision protocol rather than build more Trellis — is what Codex also
  concludes, so this is agreement, not conflict.

---

## 4. What this changes about the ruler design

Running the prototype surfaced two design problems that neither document
anticipated. These are the most useful things in this rejoinder.

### 4.1 A package-level score would have reported green

Codex's **fast compiler profile** as specified — 20 fixed courses, deterministic
compile, "maximum and median pairwise overlap by material family" — would have
produced 5–8% and been read as a pass. The defect it is meant to catch lives in
231 teaching-prose units out of 12,612, and is invisible in any package-averaged
statistic.

**The ruler must be field-weighted before it is aggregated.** Specifically:

1. Partition visible units into **teaching prose** (outline descriptions,
   instructor notes/role, student-facing summaries, discussion prompts, quiz
   explanations, speaker notes) and **administrative scaffolding** (workload
   estimates, weight provenance, format requirements, calendars).
2. Score them **separately**. Never blend.
3. Gate on the prose score. Report the scaffolding score as informational, with
   an explicit allowlist — those repetitions are correct.

Without this, the first run will show ~95% "distinctiveness" and the ruler will
have certified the thing it was built to detect.

### 4.2 The gold corpus cannot be the input

The gold samples' `enrichment` is a curated `{lens, lessonPhrases, signatureTerms}`
fixture, and their `courseMap.lessons[].sections[]` are dense hand-written
paragraphs — `learningGoals`, `topicSection`, `weeklyAssessments`,
`asyncActivities`, `syncActivities`, `evaluateDesign`, and more, per lesson.

The distinctiveness measured on that panel is supplied by the fixture author,
not by the compiler. Confirming this: degrading the `enrichment` option from
8/8 lessons to 0/8 moved the package numbers **not at all** (5.2% → 5.2%,
150 → 150 units), because the differentiating signal was never in that field.

So the fast compiler profile must run on **thin, realistic briefs** — the shape
a cold instructor actually submits — or it will measure fixture quality and
report it as product quality. This makes Codex's **production artifact profile**
not merely the better of the two, but the only one that can answer the question.

### 4.3 The question that is still unanswered

Between the two conditions measured here — ~100% collision on lesson-plan
outlines at the cold floor, 2–4% with any real differentiating signal — sits the
only number that matters:

> **What fraction of a real V0.16.96 Scion run lands near the cold floor?**

The V0.16.83 release note records a live five-lesson run that composed **1/5
evidence kernels**; the V0.16.96 acceptance records 4/4. Those two runs are on
opposite sides of this question, and nothing in the repository measures the
distribution.

That distribution — not the frame count, not the gold-panel score — is the
actual product risk. It should be the first thing the production artifact
profile reports.

---

## 5. Agreements, restated

Nothing below is in dispute between the two documents:

1. The cross-package blind spot is real and is the priority. Both documents
   independently verified that `textureMetric.js` is package-local and
   `goldSampleQualityAudit.mjs` is sample-local, and that no cross-package
   comparison exists.
2. The measurement must be built before more output-quality work, and its first
   run must be **characterization, not a gate** — Codex's framing, and running
   the prototype makes the reason concrete: the raw output needs human review to
   separate correct repetition from defect before any threshold is set.
3. The Trellis decision protocol should resume against V0.16.96 as control,
   rather than more Trellis being built.
4. The authorship inversion — compiler owns structure and verification, model
   authors bounded evidence-constrained language — is the right division of
   labor. Codex's decomposition in "Scion's future division of labor" is more
   precise than the audit's and should be the working spec.
5. The 3.35 GB activation is a real adoption barrier and should be a predicted-
   gain decision, not a device-class decision.
6. Adapter: freeze and quarantine rather than delete. Codex is right; the CI-cost
   argument was false and the infrastructure is reusable.
7. Untrack the ~1 GB of current-tip weights first; treat history rewrite as a
   separate, rehearsed migration with an evidence-anchoring plan.
8. Version freeze in spirit — milestone releases, not per-fix releases — with
   exceptions for security and data-loss.

One addition to Codex's sprint plan, from §4: **Days 1–3 should partition prose
from scaffolding and run on thin briefs.** As currently specified, the fast
profile would produce a reassuring number and cost the sprint its purpose.

---

## 6. Final position

The audit was right that the project can prove it built the package it intended
and cannot prove the package sounds like this course rather than every course.
It was wrong about what the answer would be. Having now built the instrument
rather than reasoned about it, the honest statement is:

> The templating defect is **field-local and cold-start-conditional**, not
> architectural. Roughly 2–4% of teaching-prose units collide across unrelated
> courses under normal input, rising toward total collision only when the brief
> carries no differentiating signal at all. The frames are a real ceiling on a
> real path; the open question is how often production takes that path.

That is a smaller and more tractable problem than the audit described, and a
more specific one than the response defended. It also does not change either
document's priority: build the ruler, resume the Trellis decision, invert the
authorship. It changes what the ruler must look like to be worth building, and
it retires an argument that neither side could have settled without running it.
