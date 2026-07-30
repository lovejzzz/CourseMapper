# Work Items for Codex — Post V0.16.97

**Date:** July 30, 2026
**Derived from:** [AUDIT_2026-07-29_V01697_POST_REPAIR.md](./AUDIT_2026-07-29_V01697_POST_REPAIR.md)
**Code baseline:** `5c0afb6`, V0.16.97
**Governing plan:** [CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_PLAN_2026-07-29.md](./CROSS_PACKAGE_TEXTURE_IMPLEMENTATION_PLAN_2026-07-29.md)

Ordered by whether an item blocks another, not by size. Every item carries a
verifiable acceptance condition so it can be self-checked without another
review round.

**One-line summary of where V0.16.97 stands:** the engineering is sound and the
improvement reproduces under an independent instrument. The only real gap is
that the published summary omits two numbers its own receipts contain. Items
1–4 close that in about half a day. Items 5–6 are the actual remaining work,
and every architecture decision is blocked on them.

---

## Tier 1 — Before the next release

Half a day total. These close the reporting gap, not an engineering gap.

### 1. Put cluster count and support distribution in the summary

**Why.** `docs/SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md` §"Retained result"
reports four rates and the universal-cluster elimination. All five improved.
It omits the two measures that qualify the result:

| Measure                               | Thin baseline | Thin V0.16.97 | Gold baseline | Gold V0.16.97 |
| ------------------------------------- | ------------: | ------------: | ------------: | ------------: |
| Clusters K≥2 (input-mask / path-free) |           483 |       **536** |           507 |       **538** |
| K=2 (pair-local)                      |           148 |       **195** |           238 |       **274** |

Both are present in the retained receipts — which is how this audit found them
— but appear in no summary, document, or contract claim. The repair converted a
few very widespread frames into more, less widespread ones while genuinely
cutting reader exposure 7–15%. Both halves are true; only one is published.

This is also the exact risk the governing plan named: _"adding pool entries
moves K=10 → K=5 without helping and must be caught by the support
distribution."_ The instrument caught it. The summary did not carry it forward.

**Do.**

- Add both rows per panel to the proof document's retained-result table.
- Emit both in the generated `latest-{thin,gold}.md` from
  `scripts/crossPackageTextureAudit.mjs`, so summary and receipt cannot diverge
  again by hand.

**Accept.** A reader of the summary alone can see that total cluster count rose
while exposure fell.

### 2. State provenance coverage wherever provenance is claimed

**Why.** Compiler-frame matched units:

| Panel | Matched | Unknown provenance | Coverage |
| ----- | ------: | -----------------: | -------: |
| Thin  |     942 |             24,393 | **3.7%** |
| Gold  |     189 |             14,286 | **1.3%** |

The `consumedSlot` mask view therefore covers 942 of 25,335 thin teaching
units. The coverage figure appears in no document. A reader of
`v01697-bounded-realization-receipts` would reasonably infer far broader
attribution than 3.7%.

**Do.**

- Print matched / unknown / coverage% in the generated Markdown header.
- Narrow the contract claim in `release-contracts/v0.16.97.json` to a mechanism
  claim with coverage attached.

**Accept.** No document or claim implies broader authorship attribution than
the measured 3.7% / 1.3%.

### 3. Add a K=2 ceiling to the ratchet

**Why.** `--compare-baseline` gates on rates. A rate-only gate rewards
inventory growth — precisely the move that produced +32% pair-local clusters on
the primary panel. The K=2 bucket is the two-professor scenario, which is the
defect the whole exchange started from.

**Do.** Extend the ratchet with the plan's family-level conditions:

- no increase in K=2 cluster count;
- no existing cluster gains occurrences or package support;
- no new universal high-salience class-C cluster.

**Accept.** A synthetic change that halves reader exposure by doubling the
frame inventory **fails** the ratchet. Add it as a test fixture.

### 4. Confirm Deep Proof is a required merge check

**Why.** Fast verification runs `--verify-baseline`, which confirms the
baseline receipt is readable, classified, and profile-correct. The actual
no-regression ratchet is `--compare-baseline`, which runs only in Deep Proof.
Deep Proof's scope gate triggers on any `src/lib/` change, which is the right
scope — but triggered is not the same as required.

**Do.** Verify Deep Proof is in the protected-branch required checks. If it is
not, either make it required or move `--compare-baseline` into the fast lane
(runtime is ~22s thin + ~17s gold, which the fast lane absorbs).

**Accept.** A pull request that regresses cross-package texture cannot merge
green.

---

## Tier 2 — The critical path

Nothing downstream can be decided without these two.

### 5. Extend realization trace coverage

**Why.** 3.7% is enough to prove the mechanism works and not enough to compute
anything with. Two things depend on it:

- the `consumedSlot` mask view, which the plan designated as the eventual
  release gate because it is the causal view;
- **generic fallback exposure**, which is the number that decides targeted
  repair versus architectural migration.

The trace design is already correct — non-enumerable `Symbol.for`, bounded,
opt-in, with a locked regression proving `JSON.stringify()` is identical
trace-on and trace-off. This is a coverage problem, not a design problem.

**Do.** Instrument the remaining class-C realization owners until
unknown-provenance teaching units are a minority. Preserve the trace-off
byte-identity regression at every step.

**Accept.**

- `consumedSlot` covers >50% of class-C units on both panels.
- `inputMask` vs `consumedSlot` divergence is reported per panel.
- `traceRealization: false` remains provably byte-identical.

### 6. Run Phase 3 — the production panel

**Why.** This is the question every document in the chain converged on and none
answered: **how often does real browser-local Scion reach its generic floor?**
V0.16.83 records a live run composing 1/5 evidence kernels; the V0.16.96 and
V0.16.97 acceptances record 4/4 and 6/6. The distribution between those is the
product risk, and it is unmeasured.

The six V0.16.97 browser courses are a genuine acceptance run — ready time,
readiness, kernels, materials, physical ZIP SHA-256s — but they are not a
cross-package texture panel with provenance. They cannot answer this.

**Do.**

- ≥6 fresh instructor-style briefs, never used in development, entered through
  the real workflow.
- Browser-local Scion with exact route receipts.
- Deliberate stratification: 2 strong-source, 2 partial, 2 missing coverage.
- Complete physical ZIP extraction (DOCX/PPTX/XLSX visible text).
- Realized-authorship sidecars from item 5.
- The same Phase 1 ruler across those packages.

**Accept.** One published number — generic fallback exposure in real Scion
output — as **characterization with no pass threshold**, per the standing
agreement that first runs characterize rather than gate.

---

## Tier 3 — Blocked on Tier 2

### 7. Trellis: run E2, complete E3 and E5

**Why.** The texture argument for migration is now substantially weakened — the
measured defect is a bounded, repairable cluster list, and V0.16.97 repaired
part of it. Trellis must earn adoption against the **repaired** pipeline.

**Do.**

- Normalize the contradictory status text in `docs/TRELLIS_BUILD_REPORT.md`:
  line 25 says E1–E3 "NOT claimed"; line 974 records E1 **GREEN** (judge Δ mean
  +3.0, 95% CI [+2.47, +3.53], n=7, every course positive, single-seat advisory
  caveats disclosed). The stale line has already caused one wrong citation in
  this chain.
- Run E2, complete E3 and the available E4/E5 evidence.
- Put both arms through the same Phase 1 ruler and Phase 2 provenance.

**Accept.** One pivot memo whose decision cites the Phase 3 production panel —
not the frame count, not a green package score, not architecture preference.

### 8. Make the compiler ratchet measure the family, not the file

**Why.** `bundle:check` reports `compiler 27930/28065 lines`, counting only
`courseBlueprintCompiler.js`. V0.16.97 moved 90 lines out of that file and
added 918 across six new modules — net **+828** — and the ratchet read it as a
reduction.

The new modules are legitimate (`courseCompilerRealization.js`,
`courseCompilerTextureCopy.js`, `courseCompilerLensProfiles.js`,
`courseCompilerTechnicalSessionPlans.js`, `courseCompilerSlideDiscussionCopy.js`,
`courseCompilerAssessmentRegistry.js`) and being separately cacheable is a real
delivery win. The issue is only that the ratchet cannot see them.

**Accept.** The ratchet covers `courseBlueprintCompiler.js` plus
`src/lib/courseCompiler*.js` as one budget.

---

## Explicitly not now

| Item                                           | Decision         | Reason                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untrack the 62 tracked weight files (0.98 GiB) | **Leave as is**  | The containment ratchet (`weights 62/62 files · 1053339981/1053339981 bytes`) prevents growth, and the stated cold-start reasoning is sound: removing them without a verified immutable external artifact trades repository size for a broken first run. Revisit when that artifact store exists. |
| `git filter-repo` history rewrite              | **Out of scope** | 283 release contracts and benchmark receipts embed commit identities. Needs its own migration plan, archive, and rehearsal — not a side effect of this work.                                                                                                                                      |
| Adapter product work                           | **Stays frozen** | Inactive, quarantined, ~0.65s of CI. Resume only when a candidate beats the V0.16.76 base on complete anonymous learner-facing artifacts.                                                                                                                                                         |

---

## What "done" looks like

1. The published summary matches the retained receipts — including the numbers
   that qualify the result (items 1–2).
2. The ratchet cannot be satisfied by growing the frame inventory (item 3), and
   cannot be bypassed by merging without Deep Proof (item 4).
3. Authorship is attributed for a majority of teaching prose (item 5).
4. Generic fallback exposure in real Scion output is a published number
   (item 6).
5. The architecture decision cites that number (item 7).

Items 1–4 are roughly half a day and close the only gap this audit found in
V0.16.97. Items 5–6 are the remaining substance. Item 6 is the single thing on
the critical path — it has been the open question since the first audit, and it
is now the only one left.
