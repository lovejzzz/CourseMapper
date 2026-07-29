# Scion V0.16.97 Cross-Package Texture Proof

## Goal

Ship V0.16.97 with a reproducible, provenance-aware measure of repeated teaching prose; repair only the compiler owners that the evidence identifies; preserve ordinary output and the public Scion contract; and verify generation, Agent behavior, and physical export in a real browser before publication.

The planning audit that supersedes the proposed implementation is [SCION_TEXTURE_EXECUTION_PLAN_V01697.md](SCION_TEXTURE_EXECUTION_PLAN_V01697.md).

## Lane 1 — Ruler before repair

The evaluator in `src/lib/quality/crossPackageTexture.js` extracts explicit learner-visible units from the nine standard material families. `crossPackageTextureUnitClass.js` owns the versioned class registry:

- Class A: structural scaffolding.
- Class B: intentional alignment.
- Class C: teaching prose.

It records unknown visible paths instead of silently dropping them. Its headline views keep these questions separate:

| Dimension           | Views                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Input influence     | raw, input-mask, consumed-slot                                               |
| Structural position | path-free, path-aware, same-position                                         |
| Repetition burden   | support burden, reader exposure, cross-package excess, within-package excess |
| Authorship          | compiler frame, input slot, unknown                                          |

The canonical result is separate from the run envelope. Timestamps, runtime, and Node version cannot change the retained baseline bytes.

## Lane 2 — Frozen panels and baseline

Two panels share one implementation:

- `thin`: 12 unrelated 12-lesson briefs that expose the deterministic cold floor.
- `gold`: 10 retained real-course fixtures from the existing quality audit.

The pre-repair compressed baselines are immutable and include exact package IDs and input hashes. Fast verification checks that both baseline receipts remain readable, classified, and profile-correct. Deep Proof recompiles both profiles and applies the same comparison ratchet.

## Lane 3 — Realization receipts

`courseCompilerRealization.js` provides opt-in, bounded trace receipts. Each receipt carries:

- owner and pool ID;
- lesson number;
- selected index and pool size;
- selected learner-visible text;
- consumed lesson slots.

The trace uses a non-enumerable symbol. A locked regression proves `JSON.stringify()` is identical with tracing on and off. Normal generation therefore does not gain a new field, payload, or storage contract.

## Lane 4 — Measured repair

The candidate repairs replace whole-sentence lesson-number modulo selection only where the ruler found high-salience, cross-course collisions. Stable context keys independently choose a lead and tail for:

- assignment evidence, revision, and milestone lines;
- study-guide primary hints and evidence-note practice;
- lesson-plan warmups, collaborative instructor notes, and student summaries;
- slide course throughlines and final carry-forward;
- slide discussion decisions.

The copy families live in compiler-only cache leaves. They are evidence and teaching moves, not decorative synonym lists.

### Retained result

| Panel | Measure                    | Pre-repair | V0.16.97 | Relative change |
| ----- | -------------------------- | ---------: | -------: | --------------: |
| Thin  | Support burden             |     6.287% |   5.838% |           -7.1% |
| Thin  | Reader exposure            |    10.905% |   9.777% |          -10.3% |
| Thin  | Cross-package excess       |     7.973% |   6.746% |          -15.4% |
| Thin  | Within-package excess      |     2.711% |   1.824% |          -32.7% |
| Thin  | Universal Class-C clusters |         31 |        0 |      eliminated |
| Gold  | Support burden             |    10.224% |   9.105% |          -10.9% |
| Gold  | Reader exposure            |    20.765% |  19.316% |           -7.0% |
| Gold  | Cross-package excess       |    14.935% |  13.347% |          -10.6% |
| Gold  | Within-package excess      |     7.039% |   6.494% |           -7.7% |

The gold panel still contains universal fixture-aligned FAQ and slide phrases. V0.16.97 does not hide that result or claim a zero-repetition production rate.

The final compressed V8 snapshots are retained at
`verification-output/cross-package-texture/snapshot-post-repair-v8-{thin,gold}.json.gz`.
Their canonical result SHA-256 receipts are
`e9a4438c0eaf95e35017e27befac692d53746b0bf949ae578c0dde6968d5960f`
and
`7cf8fde03ee66d05b705cb984d0b7fa6bdad5a22c0ebcd7bbd87ccda097723a4`.

## Lane 5 — Delivery architecture

The first-paint release record now lives in `currentRelease.js`; historical changelog data remains lazy with the Changelog route. The compiler’s provenance mechanics, modality lens profiles, slide-discussion composer, and new copy families are separately cacheable and stay off landing. The core compiler is reduced to 27,930 lines and 840.1/235.9 KiB raw/gzip, below its shipped line and byte ceilings. The landing route remains 259.9/82.7 KiB raw/gzip.

Tracked public model weights remain in place. Removing them without a verified immutable external artifact would trade repository size for a broken cold start, so that migration is explicitly outside this patch.

## Lane 6 — Browser and physical export

The final local browser panel used six new instructor-style briefs, the public
Scion identity, the explicit-sequence route, optional current-source research,
the complete Living Course Compiler, and the actual Export panel. Every row
started from the Landing course brief rather than importing a precompiled
project.

| Course                             | Ready | Automated readiness | Texture | Kernels | Materials | Encoded findings | Physical ZIP SHA-256                                               |
| ---------------------------------- | ----: | ------------------: | ------: | ------: | --------: | ---------------: | ------------------------------------------------------------------ |
| Community Data Storytelling Studio |   29s |              63/100 |      96 |     6/6 |       9/9 |                0 | `b5e5617141cc5113e1c81c111f5381d264181e9e53e715b9f81a5043c5e97d90` |
| Music Theory Fundamentals          |    3s |              69/100 |      97 |     4/4 |       9/9 |                0 | `9b043262932514e86ae0247bcebcc94d03e141633c44e1a9ee04840f46cb5a27` |
| User Experience Evidence Studio    |    5s |              69/100 |      97 |     4/4 |       9/9 |                0 | `03ea6cb38d1bb61c2d85b08f1f1f1fb365601f71556fbb0d73507e158cc7b460` |
| Astronomy                          |   11s |              66/100 |      96 |     4/4 |       9/9 |                0 | `2d0c9ff15ce03eeb03c1f098cb6d1e6ac0cb70679cecd8e4a11108993ac5aed2` |
| Supply Chain Resilience            |   26s |              61/100 |      97 |     4/4 |       9/9 |                0 | `ab10fef0d8018dcaedd1d31ebaf5d91af9379ee244b7f00ae46b549dedcdd0e1` |
| Environmental Ethics               |   17s |              66/100 |      97 |     4/4 |       9/9 |                0 | `e6c56cc9c97aeb948835e5b1be5d935f1c6eb8d4ae5de5c56a5032391b9f8b25` |

All six archives pass `unzip -t`, report `ready`, contain zero blockers and
warnings, and carry 99/A deterministic package conformance with zero encoded
P0/P1/P2 findings. That 99/A is not presented as teaching quality: the bounded
Automated Readiness values remain visible and below the independent-evidence
ceiling.

Frame-by-frame inspection confirmed monotonic, named compiler stages through
100%; exact title, count, and ordered-lesson preservation; green autosave and
Export states; one Download ZIP action; readable desktop and phone navigation;
and no inspected application-console error or warning. The Data Storytelling
run crossed visible frames at 31, 36, 41, 43, 75, and 100 percent. The Supply
Chain regression replay crossed 31, 38, 42, 95, and 100 percent after its
grader defects were fixed.

The Agent answered **“Summarize course sequence”** from the live Data
Storytelling workspace, listed all six requested weeks in order, and cited the
Syllabus weekly schedule and Course Map rather than inventing a parallel
sequence.

The panel found and repaired real defects that the proposed texture plan alone
would not have caught:

- exact imperative course titles and ordered numbered sequences now survive the
  first frame and export;
- Data Storytelling uses its own artifact genre and teaching decisions instead
  of borrowing literature, machine-learning, UX, or music routing;
- music shard inference no longer treats data-visualization “scale” as music;
- duplicate terminal assessments and “Final final” titles are normalized at one
  registry owner;
- the Agent grounds cross-lesson sequence answers in named workspace artifacts;
- source breadth checks use explicit source session scope instead of claiming
  that all lessons rely on a one-lesson source;
- citation relevance can use the matched ledger passage and concept link rather
  than condemning a relevant short title such as “Bullwhip effect”;
- every admitted-kernel weekly quiz now includes an evidence-bound
  interpretation item, raising the real Supply Chain package above the applied
  stem floor without lowering the ruler;
- assignment milestone cards remain readable at narrow responsive widths.

## Release Boundary

V0.16.97 proves a deterministic compiler-texture improvement against two retained panels. It does not prove:

- Gemma weight training or adapter superiority;
- paid-model parity or superiority;
- factual certification;
- instructor or learner approval;
- accessibility certification;
- classroom outcomes;
- a universal production repetition rate.

The grader dependency graph changed in this release, so V31 creates a new
16-file transitive implementation receipt over the unchanged five held-out
course identities. It inherits no V30 score, adapter result, or promotion
claim.

Trellis or another compact runtime may consume the same unit/ruler contract later, but it earns promotion only through matched packages, latency, export integrity, and this same claim boundary.
