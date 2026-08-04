# Scion × Roundtable learning checkpoint audit — v0.17.12

## Decision

Freeze the classroom, preregistration, evidence-binding, strict-selection, and audit plumbing as a **development checkpoint**.

Do **not** freeze or promote the Roundtable teacher policy, the Scion learner, or any generated training rows. The source holdout exposed invalid reference seeds and real factual/pedagogical failures. Production and training eligibility remain false in every artifact.

## What the evidence says

### Policy-interface exam

The real local Scion model improved from 77/100 without the diagnostic policy to 100/100 immediately and 100/100 on the delayed fixture exam. This proves that Scion can execute the bounded policy interface under atomic prompts. It does not prove source-derived transfer because the exam signals are fixtures.

Promotion is blocked by:

- fixture-assigned rather than verifier-derived signals;
- no independently attested runtime sessions;
- no independent review.

Evidence: `verification-output/scion-classroom-model-run/model-experiment.json`.

### Reused source-development cases

On twelve real source-bound development defects, the current contract-plus-pedagogy gate reports:

- legacy one-call baseline: 3/12 admitted;
- matched surgical control: 7/12 admitted;
- Roundtable-policy arm: 8/12 admitted;
- deterministic candidate availability: 10/12, with three teacher rescues and two control retentions.

This set was repeatedly used to refine the prompt, so it is implementation evidence only. The policy arm also has paired losses; it is not a clean promotion result.

Evidence: `evaluation/scion-adapters/evidence/scion-roundtable-source-experiment-v0.17.12.json` and `evaluation/scion-adapters/evidence/scion-roundtable-source-review-packet-v0.17.12.json`.

### Precommitted source holdout

Membership, counterbalanced arm order, inputs, hidden reference commitments, and thresholds were frozen before inference. The raw result was:

- matched control: 7/12;
- teacher: 8/12;
- first attempt: 4/12 versus 8/12;
- three teacher rescues and two teacher regressions;
- permissive OR-union: 10/12.

The post-run source-strict audit invalidated the experiment for promotion:

- only 7/12 reference seeds passed `source-strict-v6`;
- five reference seeds were semantically invalid;
- the conditionals seed labeled a true `and` rule as a misconception, causing both arms to generate the false `or` rule;
- strict output admission was control 5/12 and teacher 7/12;
- the implemented strict retention selector emitted 7/12: five control retentions, two teacher rescues, and five quarantines.

The precommitment was procedurally valid, but its population was not. It is a checkpoint for the audit machinery, not evidence for policy promotion.

Evidence:

- `evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-prereg-v0.17.12.json`
- `evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v0.17.12.json`
- `evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-seed-audit-v0.17.12.json`

## Root cause: why quality stayed hard

The model is a constraint, but it was not the only or even the first architectural problem.

1. Rejected-answer contamination: Scion was shown the bad `cx` while being asked to replace it, so the compact model copied it.
2. Oversized tasks: whole-atom and batched generation hid which field failed; atomic surgical generation was much stronger.
3. Lexical admission masqueraded as pedagogy: padded misconception copies and definition paraphrases could pass deterministic gates.
4. Source-ledger mismatch: the learner could read uncited claims while preserving old `sourceFactIndexes`, producing plausible but unauditable corrections.
5. Confounded evaluation: earlier baseline and teacher arms had different prompts, scopes, and budgets.
6. Invalid gold seeds: structurally admitted reference atoms contained true “misconceptions,” unanchored terms, and unsupported corrections. A precommitted test cannot rescue an invalid construct.
7. Self-verification is insufficient: Scion can produce strong corrections from a bounded scaffold, but it cannot reliably detect its own factual reversals.

The architectural answer is therefore not “make the prompt longer.” It is: withhold rejected output, decompose the task, bind only authorized evidence, keep a matched control, counterbalance execution, use strict external admission, retain a valid control candidate when teacher advice regresses, and quarantine uncertainty.

## Implemented checkpoint

- Course-neutral Scion student questions expose terminal issue families and bounded actions only after the local retry budget is exhausted.
- Roundtable teaching candidates remain diagnostic and training-ineligible.
- Classroom manifests separate public packets from private nonce-bound keys.
- Promotion replays exact artifacts, derives paired/domain effects from result rows, and fails closed on fixture signals, missing review, or unattested sessions.
- Exact local model calls carry unique server UUID receipts, model bindings, raw output hashes, and exact request messages.
- Source repair withholds the rejected correction, preserves all other fields, reveals only claims authorized by preserved indexes, and uses an auditable `mistakenDimension`/`supportedDistinction` scaffold.
- Matched arms share projection, feedback, retry ceiling, and counterbalanced order; only teacher-policy access differs.
- A source-strict selector now retains control when it passes, uses teacher only as a rescue, and quarantines when neither passes.
- The v2 holdout preflight fails closed because no unused, project/source-disjoint, source-strict corpus currently meets the frozen quota.

## Exact next gate

The v2 preflight currently has zero eligible unused cases in each required domain after excluding development and v1 holdout projects. It correctly refuses to manufacture a score.

Before another holdout can run:

1. Expand verified source-capture evidence with at least four new prompt-level source groups in each required domain.
2. Validate each complete seed atom (`tr`, `df`, `eg`, `mi`, reference `cx`, and indexed claims) with `source-strict-v6` before sampling.
3. Obtain two genuinely independent factual and pedagogical approvals before membership freezes.
4. Prove disjointness by project, source-packet identity, and normalized source-content overlap.
5. Freeze membership, counterbalanced order, inputs, references, selector behavior, and thresholds before inference.
6. Score the emitted strict-selector result, not an OR-union; require zero teacher losses and the preregistered retention threshold across the full valid population.

Evidence: `evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v2-preflight-v0.17.12.json`.

## Roundtable changes proven by this work

Roundtable now exposes live quiet-process liveness, continues without authentication interruptions when a participant is unavailable, supports adding rounds during a live room, runs Fable only at the final audit seat, and prepares dependency-capable disposable workspaces by cloning the project `node_modules` tree once with copy-on-write semantics.

The current rooms still had only Codex available. Claude, Antigravity, and Fable were unavailable, so “independent audits” inside the completion brief were repeated Codex audit passes—not independent model participants. That limitation is material and is not counted as the independent review required by Scion promotion.

## Verification

- EDUTOOL: 519 test files passed, 6,691 tests passed, 162 skipped.
- EDUTOOL production build passed; the existing large-chunk warning remains.
- Roundtable: 151 bridge tests passed, production build passed, and 2 rendered-HTML tests passed.
- `git diff --check` passed in both repositories.

## Final checkpoint label

**Checkpoint: audit/classroom machinery only.**

**Not a checkpoint: teacher policy, semantic learner quality, adapter training, or production promotion.**
