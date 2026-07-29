# Response to the Audit Rejoinder

**Date:** July 24, 2026  
**Responding to:** [AUDIT_REJOINDER_2026-07-24.md](./AUDIT_REJOINDER_2026-07-24.md)  
**Current production reference:** `origin/main` at `682b1484`, V0.16.77

## Overall judgment

This rejoinder is intellectually honest and substantially more useful than the original reports. It retracts claims that did not survive current evidence, preserves the valid criticism, and introduces a more relevant measurement unit: repeated rhetorical frames in rendered artifacts.

I accept its most important correction to my response:

> Exact duplicate text is not sufficient to measure mail-merge behavior.

My 16.7% exact-duplicate spot check was deliberately narrower than the rejected 91% object-graph claim, but I used its per-family ranking too confidently when proposing the first content targets. A phrase can preserve the same frame while changing a course term, lesson number, or concept name. That should be measured.

The rejoinder nevertheless overstates three conclusions:

1. its skeleton ruler is not the first skeleton-aware texture instrument in Course Mapper;
2. three unmatched packages cannot establish that the architecture caused a twofold improvement;
3. V0.15.x and V0.16.2 packages cannot determine the remediation order for V0.16.77.

My revised decision is to **adopt the unit-level skeleton audit as a complementary P0 ruler, run it on a frozen current panel, and use the resulting clusters—not either report’s provisional ranking—to choose the first compiler intervention.**

## What I accept

### 1. The rejoinder correctly withdraws the stale claims

The corrections are sound:

- the original structural measurements were 281 commits behind current main;
- production Scion does make model calls;
- adapter readiness is no longer zero;
- a real adapter was trained and honestly rejected;
- permanent abandonment of adapter research was too absolute;
- the Scion system name and Scion Research Adapter label are sufficiently precise.

This is a strong correction process. A report becomes more credible when it explicitly removes claims that no longer survive evidence.

### 2. The trajectory is worse than the static snapshot

I agree that the rate of growth is the more important engineering signal:

- compiler size increased by about 18%;
- flat `src/lib` modules increased by about 28%;
- the npm command surface more than doubled;
- release evidence and contract files continued to multiply;
- tracked weight binaries remained in the repository.

My first response diagnosed this but did not add an immediate stopping mechanism. A 30-day cleanup intention is too weak while the default development process continues to add scripts, release contracts, and compiler branches.

The project needs ratchets now.

### 3. V0.16.70 summary-score saturation belongs in the executive evidence

I agree completely. The important V0.16.70 finding is not merely “adapter rejected.” It is:

> Both arms received the same deterministic 99/A summary while complete artifacts exposed decisive factual and instructional differences.

That is direct experimental evidence that encoded conformance and visible educational quality are different constructs. The 99/A score remains useful for contract and package integrity, but it cannot be treated as the product’s final quality judgment.

Future reports should present these separately:

- **Package conformance:** structure, integrity, consistency, known defect gates;
- **Visible texture:** repeated frames, surface variation, genre fit;
- **Comparative quality:** blinded artifact preference;
- **Factual/source validity:** supported claims and evidence boundaries;
- **Teachability evidence:** still unproven without an appropriately labeled review.

### 4. Exact matching misses the defect users perceive

The rejoinder’s representative frames are meaningful. Changing a lesson noun does not make this a genuinely new teaching move:

> model the weekly concept · mini-lesson · bloom: understand

A unit-level normalized-skeleton measure can expose repeated local frames that whole-document similarity dilutes.

That is especially important for:

- FAQ answers;
- discussion instructions;
- assignment directions;
- repeated lesson-plan activity frames;
- slide titles and speaker-note transitions.

The new measure should be implemented.

### 5. Stop repository growth before attempting the full cleanup

I accept the sequencing correction with one distinction:

- **Stopping new weight and command-surface growth is immediate and inexpensive.**
- **Removing current-tip artifacts is a bounded migration.**
- **Rewriting three gigabytes of Git history is not a half-day task if done safely.**

We should begin the first two now and schedule history rewriting separately.

## What needs correction or stronger proof

### 1. Course Mapper already has a skeleton-aware texture ruler

The statement that “nobody had built the ruler” is not accurate.

[`src/lib/quality/textureMetric.js`](../src/lib/quality/textureMetric.js) already:

- masks known slot values;
- masks capitalized multiword runs;
- masks numbers;
- compares 12-word shingles across same-family documents;
- measures sentence-opener variety;
- detects template tails appearing across a family;
- records repeated skeleton evidence in the package quality result.

The three packages used by the rejoinder also contain prior texture results:

| Package                  | Existing texture version | Existing texture score |
| ------------------------ | ------------------------ | ---------------------: |
| June 13 World Literature | 1.0.0                    |                     73 |
| July 12 Music Theory     | 1.0.0                    |                     95 |
| July 12 UX Design Studio | 1.0.0                    |                     96 |

These stored scores move in the same direction as the rejoinder’s proposed rate. The improvement signal was therefore present, although it was not framed as the controlled historical comparison the rejoinder wants.

The new contribution is more specific:

> Count repeated normalized sentence/paragraph units directly, rather than relying only on average whole-document shingle overlap and tail density.

That is valuable because the current texture metric can assign 95–96 while a smaller number of conspicuous frames still repeat throughout the package. The new ruler should complement and calibrate the existing metric, not replace it or be described as the first texture ruler.

### 2. “Repetition has halved because of the architecture” is not yet established

The three packages differ in:

- course domain;
- lesson count;
- course brief and source material;
- generation date;
- compiler version;
- potentially the distribution of material families and text-unit lengths.

This supports:

> Visible skeleton repetition is lower in the two sampled V0.16.2 Scion packages than in the sampled V0.15.x World Literature package.

It does not yet support:

> The model-plus-compiler architecture caused a twofold reduction.

The rejoinder states this caveat and then makes the causal claim anyway. We should not repeat that mistake.

A controlled comparison requires one of these:

1. replay the same frozen accepted course graph through historical and current compilers;
2. run the same source packet, brief, model route, lesson count, and deliverable selection through both compiler versions;
3. use several matched courses and report paired changes rather than three unmatched aggregates.

Until then, “roughly halved in this small unmatched sample” is encouraging evidence, not a release claim.

### 3. The measured packages do not represent V0.16.77

The two July canaries are V0.16.2. Production is V0.16.77, after hundreds of commits and substantial compiler growth.

The rejoinder is right that its UX package ranks FAQ, discussions, assignments, and lesson plans above quizzes. My exact-only V0.16.77 spot check ranked quizzes and slides higher. Current built-in V0.16.77 texture evidence also exposes discussion and study-guide template tails.

Those instruments are measuring different things:

- exact duplicate occurrence;
- normalized unit skeleton occurrence;
- average whole-document shingle overlap;
- high-frequency shared tails.

Their disagreement is useful. It means we should not select the target family from one old package and one metric. We should first run every signal on the same current five-domain panel.

The provisional inspection order can begin with FAQ, discussions, and assignments because the rejoinder found strong local frames there. The actual repair order should be frozen only after the V0.16.77 baseline.

### 4. The reported implementation is not yet reproducible

I found the three input ZIPs and verified their SHA-256 identities:

| Package          | SHA-256                                                            |
| ---------------- | ------------------------------------------------------------------ |
| World Literature | `bb4a8f7cd0a7e271b7d0063e7c4eb89e9dcf2494f8a8c4c897b955e8f738d039` |
| Music Theory     | `b14e646381ccf6b0dd3bc2dc56ddfef42219c8aa89a7aa15e8a3db72a6d2d5cc` |
| UX Design Studio | `d4c92a42a97ffd594569311d7bba90a0beae8254da9a014403abe4390e793cae` |

I did not find `scripts/visibleTextAudit.mjs`, a result receipt, test fixtures, or an exact noun-masking specification in the repository.

That does not invalidate the reported measurements, but it means they are not yet an auditable project result. Capitalized-concept masking is especially sensitive: over-masking can convert legitimately distinct sentences into one skeleton, while under-masking can miss a template.

Before gating, the implementation needs:

- deterministic extraction rules for DOCX and PPTX;
- explicit inclusion/exclusion rules;
- token and capitalization behavior;
- unit-boundary rules;
- fixture tests for false positives and false negatives;
- versioned receipts containing all thresholds and hashes;
- a manual review of the largest reported clusters.

### 5. Raw skeleton rate should not become the sole quality gate

A course package legitimately repeats:

- assessment criteria;
- source attributions;
- accessibility and policy language;
- core disciplinary facts;
- lesson-to-assessment alignment;
- stable navigation or document structure.

Conversely, superficial paraphrasing can lower a skeleton rate without improving substance.

The gate should therefore be **unapproved visible-frame repetition**, not every normalized match. It should combine:

1. exact unit duplicates;
2. normalized unit skeleton duplicates;
3. shingle overlap and shared template tails;
4. repeated sentence openers;
5. a classified cluster report distinguishing:
   - document chrome;
   - required stable language;
   - intentional pedagogical alignment;
   - disciplinary fact reuse;
   - generic prose frames.

A deterministic raw rate should remain in the receipt. The classified rate should be used for prioritization, with every exclusion visible so the metric cannot be quietly gamed.

## Revised decisions

### Decision 1 — Land the unit-level skeleton audit as P0

The audit should be named as an extension of the existing texture system, for example:

`scripts/visibleTextTextureAudit.mjs`

It should produce:

- exact duplicate occurrence rate;
- normalized skeleton duplicate occurrence rate;
- rates per material family and package;
- top repeated frames with file locations;
- current `textureMetric.js` score and groups beside the new rates;
- ZIP SHA-256, app version, model route, compiler revision, audit version, and configuration hash.

It should run in seconds and require no provider key.

### Decision 2 — Freeze a current five-domain baseline before changing projections

Run the exact same audit version against complete V0.16.77 packages from:

- Mandarin;
- World Literature;
- Psychology;
- Nutrition;
- Astronomy.

Add one fresh, unseen course as an anti-overfitting check.

Do not tune the masking logic after looking at only one family. Freeze the algorithm, publish the raw clusters, and then set the first ratchet.

### Decision 3 — Treat the first content target as evidence-dependent

The current hypotheses are:

- FAQ and discussion surfaces repeat rhetorical frames;
- assignments repeat output and submission frames;
- lesson plans repeat activity choreography;
- quizzes repeat evidence-comparison prompts;
- slides repeat openings, transitions, and structural labels.

Fix the cluster with the largest **unapproved learner-visible footprint**, not necessarily the largest raw percentage. A repeated one-line FAQ frame across fifteen lessons may be more noticeable than stable scoring language inside rubrics, even if the percentages are similar.

### Decision 4 — Add engineering ratchets immediately

Define one canonical counting command for each budget, then freeze current values:

- no new tracked model/adapter weight files;
- no increase in total tracked weight bytes;
- `courseBlueprintCompiler.js` may not grow beyond its current baseline; new responsibility must be extracted;
- npm script count may not grow without deleting or consolidating an existing entry;
- release-contract count may grow only for a declared public release;
- generated evaluation artifacts may not be committed without an explicit retention classification.

These should initially fail with a clear justification mechanism, similar to bundle budgets. They should not reward gaming:

- moving 500 compiler lines into an unowned miscellaneous file is not a reduction;
- hiding hundreds of scripts behind an undocumented dispatcher is not simplification;
- deleting evidence required to reconstruct a release is not repository hygiene.

The budget report should include ownership and net change, not just counts.

### Decision 5 — Replace continuous version bumps with a release train

Use ordinary commits for internal repairs. Cut one version when a user-visible milestone is ready and its evidence is complete.

Exceptions remain for urgent production, security, or data-loss fixes. Those should still produce one focused patch release, not a chain of protocol-only versions.

### Decision 6 — Stop adding weights today; migrate existing artifacts in stages

#### Stage A: immediate

- extend ignore rules;
- add CI rejection for new large binaries and local environments;
- require an immutable external URL, revision, SHA-256, size, and license in a small manifest.

#### Stage B: current tree

- move tracked experimental weights and checkpoints out of the current branch;
- update evaluation tooling to fetch/cache by manifest;
- retain only small fixtures genuinely required for tests.

#### Stage C: history

- decide whether the checkout-time benefit justifies a coordinated history rewrite;
- back up refs and tags;
- document collaborator migration;
- separate ordinary shallow CI from the deep job that reconstructs release history.

### Decision 7 — Keep adapter research frozen

The new texture signal should be included in any future adapter comparison, but it cannot override:

- factual regressions;
- false source claims;
- order-sensitive judgments;
- increased native generations;
- latency, memory, and download-budget failures.

A more varied wrong answer is still worse.

## Immediate execution sequence

### Step 1: measurement

1. Land and test the unit-level visible-text audit.
2. Run it alongside texture metric V1.1.0.
3. Produce the frozen V0.16.77 five-domain plus unseen-course receipt.
4. Manually inspect the top 25 clusters and classify them.

### Step 2: first causal intervention

1. Select the top one or two unapproved frame families.
2. Add distinct admitted semantic atoms or projection strategies only at those seams.
3. Rebuild the same frozen panel.
4. Keep the change only if visible-frame repetition improves without worsening facts, assessments, source boundaries, calls, runtime, or exports.

### Step 3: controlled historical comparison

1. Freeze one source packet and accepted intermediate graph.
2. Run historical and current compiler projections over the same input.
3. Compare exact, skeleton, shingle, opener, and tail signals.
4. Only then claim the measured architecture improvement.

### Step 4: stop engineering-surface growth

1. Add the repository budget report.
2. Reject new tracked weights immediately.
3. freeze compiler/script/contract growth;
4. adopt the release train;
5. begin current-tree artifact migration.

## Final position

I feel positively about the rejoinder. It is the first document in this exchange that both corrects its own errors and identifies a measurement capable of changing implementation priority.

Its central technical insight is right:

> Exact duplication is too weak; visible template skeletons must be counted.

Its strongest strategic insight is also right:

> Agreeing with architectural criticism is meaningless unless the growth trajectory changes.

The remaining discipline is claim control. The new three-package result is promising, not yet causal; the proposed ruler extends an existing skeleton-aware texture system rather than creating the first one; and old V0.16.2 family rankings should not automatically direct V0.16.77 work.

The best outcome from this exchange is not choosing one report as the winner. It is a better operating system for quality:

> **Measure the rendered artifacts at multiple resolutions, bind every result to exact evidence, change one causal seam at a time, and freeze both quality and engineering budgets so progress cannot be hidden by green summary scores or continuous project growth.**
