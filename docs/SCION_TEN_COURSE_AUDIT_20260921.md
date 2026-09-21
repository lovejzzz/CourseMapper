# Scion ten-course field audit — v0.20.04

Audit dates: September 20–21, 2026. Baseline: production v0.20.03, commit `750680270e6e47850ed901a66bcff9e2246e831a`. Follow-up: local v0.20.04 implementation, same browser workflow and course briefs.

## Outcome and limits

Ten distinct courses were generated through the actual website and exported, covering 20 lessons, 80 questions and 210 DOCX/PPTX files. All ten exports could be opened and structurally parsed. This did **not** establish classroom readiness: 62 of 80 questions carried `sourceReviewRequired`, and close reading found missing subject-specific exercises even among questions without that flag. The flag count is not an accuracy percentage.

This release addresses three observed causes: explicit numeric inputs being ignored in two bounded exercise families, unrelated sources entering specific course contexts, and exclusive model-cache readers preventing simultaneous browser tabs from activating Scion. Five affected courses received targeted browser reruns. The remaining five were audited at baseline, not represented as post-change passes.

The Scion model weights were not changed or retrained. Improvements are in input interpretation, deterministic calculation, source admission, material projection and browser runtime behavior. Ordinary users do not need MCP; the inspection interface remains behind the developer output-debug entry point.

## Baseline courses and findings

Every brief requested two ordered 60-minute lessons, an independent practice task and four quiz questions per lesson, with specific answers and explanations. Lesson count, order and quiz counts were retained in all ten saved packages. Duration was requested; this report does not certify instructional pacing.

| Course                                | Concrete requirement                                                              | Questions flagged for answer review / 8 | Recorded model calls | Main content finding                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------: | -------------------: | ------------------------------------------------------------------------------------ |
| Python Lists and Loops                | Trace list mutation and an accumulation loop with printed output                  |                                       6 |                    1 | Generic records/loop descriptions replaced runnable code and exact traces.           |
| Descriptive Statistics                | Use `[2,4,4,6,9]`; compute mean, median, both variance conventions, effect of 100 |                                       4 |                    1 | Supplied observations were not used for concrete calculations.                       |
| Forces and Motion                     | Acceleration 2 m/s² for 3 s; mass 4 kg and force 12 N                             |                                       6 |                    1 | Numerical worked steps and units were missing; generic evidence tasks dominated.     |
| Chemical Reactions and Moles          | Balance hydrogen combustion; 4 mol H₂ and 3 mol O₂                                |                                       6 |                    1 | Actual balancing, limiting reagent and remaining oxygen were absent.                 |
| Mendelian Genetics                    | Aa × Aa and Aa × aa Punnett squares and probabilities                             |                                       8 |                    2 | Generic records did not answer the requested inheritance problems.                   |
| Supply Demand and Price Controls      | Qd=100−2P, Qs=20+2P, ceiling P=10                                                 |                                       4 |                    0 | Source facts/general tasks replaced the supplied equilibrium algebra.                |
| Industrial Revolution Source Analysis | Inspectable nineteenth-century factory testimony with attribution                 |                                       8 |                    2 | No adequate primary excerpt for the actual questions.                                |
| Close Reading of Ozymandias           | Exact public-domain quotations, line numbers and inscription/ruin contrast        |                                       6 |                    1 | Unrelated translation material entered the lesson; requested poem evidence missing.  |
| Spanish Introductions for Beginners   | Accurate dialogue, glosses, accents and ser exercises                             |                                       6 |                    1 | Generic name/entity facts replaced language practice; four P0 resource dependencies. |
| Ecology and Experimental Design       | Hypothetical 10,000/1,000/100 kJ chain; controlled plant experiment               |                                       8 |                    2 | Generic records replaced energy calculations and a concrete experiment.              |

These were genuine website generations, not replay fixtures. Recorded model calls are reported separately because cached evidence can produce a new course package without a new model invocation. The economics baseline was such a cached run.

## Corrections and targeted evidence

### Calculations from supplied inputs

The compiler now recognizes one explicit numeric dataset for mean/median/variance lessons and a bounded pair of linear demand/supply equations plus a price ceiling for matching lessons. It computes results from those values rather than using a fixed example. It refuses ambiguous/malformed inputs, invalid curves and unsupported cases. Instructor-owned tasks, complete worked examples and source-only constraints retain precedence.

The calculated exercise feeds quiz keys, worked examples, practice, assignment directions, rubric criteria, study guides and native slide tables. It does not admit an external source or validate all surrounding course prose.

Final browser exports contained these independently checked answers:

- Statistics: mean 5, median 4, range 7, n=5; squared-deviation sum 28, population variance 5.6, sample variance 7; adding 100 gives mean 125/6 (displayed 20.83333333), median 5.
- Economics: equilibrium P=20, Q=60; at P=10, Qd=80 and Qs=40; ceiling binding, shortage 40, maximum trades 40; fixed linear curves with other determinants held constant.

All 16 reference responses matched the exercise requirements. Final reruns reused cached evidence (zero new model calls); this is a calculation/projection verification, not evidence that the model itself learned arithmetic. Population/sample formulas were cross-checked independently with Python's statistics library. Changed-input and nonbinding-ceiling unit tests guard against hard-coded answers.

Both final PPTX files were converted to PDF and rendered for visual inspection. Slide 3 showed native readable numeric tables. This inspection caught and fixed a slide-type mismatch that previously prevented table rendering. Repeated generic speaker notes were replaced with page-specific explanation. Exporter table layouts show up to three rows; complete calculations remain in the worked slides and teacher keys.

### Course-specific source admission

Named close-reading works, introductory target languages and Industrial Revolution context now constrain retrieval and cached kernel admission. The filter evaluates source identity/content, not merely the requested topic copied into metadata.

Targeted literature and Spanish reruns stopped admitting the observed unrelated translation/name sources. A historical rerun exposed an additional unrelated religious-history match; the final history scope excludes that candidate. The final history, literature and Spanish packages each had no admitted lesson source and all eight questions still required review. This is an improvement in honesty, **not** a completed source-retrieval solution. Spanish still has four P0 dependencies involving unresolved required resources.

### Multiple browser tabs

A production history/literature pair reproduced a browser error: `createSyncAccessHandle` could not open a file because another access handle or writable stream was open. Three retries did not resolve that lock. The failed literature attempt is excluded from the successful baseline table; after releasing the other tab, a serial literature rerun completed and was exported.

The v4 JavaScript worker now opens immutable model files with `mode: "read-only"`; writer behavior stays exclusive. The change is rebuilt from the SHA-pinned v3 JavaScript artifact. WASM and model weights remain unchanged. Cache-busy errors preserve the cache and explain how to release an older reader/download rather than treating valid weights as corruption. This follows the [documented shared read-only access mode](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle).

A local history/literature pair then completed concurrently with recorded model calls in both tabs (one and two respectively), without the lock error. A focused worker test also opens two read handles and verifies cleanup. Concurrent first-time downloads remain outside this claim.

## Verification

- Full `npm run check` passed: typechecks, lint, studio, authoring, compatibility and Scion suites, output/acceptance benchmark tests, build and bundle checks.
- Focused input/source/runtime tests passed, including changed numeric inputs, malformed/ambiguous inputs, source-only protection and cached-source scope rejection.
- Final generated statistics/economics outputs were re-exported after projection adjustments; 16 answers were checked and two PPTX renders inspected.
- Across baseline and five final targeted packages, 315 Office files parsed successfully. Thirty student quiz documents contained no `Answer Key` heading. This structural check is separate from semantic answer leakage and full visual accessibility review.
- The production-browser suite covers exports, reference-provider policy, Firebase bootstrap, developer-only MCP/revocation and complete changelog history. It detected missing new changelog section labels; the release metadata was corrected without weakening the assertion. All five final production-browser checks then passed, along with the final build and bundle checks.

## Next quality work

1. Carry concrete programming, mechanics, chemistry, genetics and ecology inputs through the teaching task pipeline, with discipline-specific verified examples and answers.
2. Retrieve and package actual primary passages for history and named literature; require answerable questions about those passages.
3. Generate usable beginner-language dialogue and exercises, and resolve or remove unsupported resource dependencies through the lesson design itself.
4. Align course-map objectives, discussions and every related artifact with the concrete quantitative task; current improvements do not make all ten material families equally specific.
5. Expand independent answer and rendered-document checks across more course types. Existing package grades and successful exports must not be interpreted as factual-quality certification.

## Local evidence inventory

The local, ignored directory `verification-output/ten-course-v02004/` contains frozen `baseline/01`–`10`, targeted `after/02`, `06`, `07`, `08`, `09`, original prompts, saved projects, ZIPs, manifests, quality reports, extracted Office text, numeric verification receipt and rendered slide checks. These packages are audit outputs, not publicly published example courses. The following hashes identify the exact saved projects and exports used here.

| Phase    | Course                                | Project SHA-256                                                    | ZIP SHA-256                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| baseline | Python Lists and Loops                | `b4adbbb3cd421e385b461a317fa8350aed7ce144cfcd322946261ddea81e1253` | `2fdd425a730d08a92defee1a46c58538d4f30d1bf68dd23be27d95a5fc5a1bcf` |
| baseline | Descriptive Statistics                | `8463f584ad3b62db4106a103b124332a6b82e46d4d081bb9b16259612263e4a4` | `173d84b726f2bfbd3af3a6d6a84955e8e8c0349882372e50faa7767a4ad08d4d` |
| baseline | Forces and Motion                     | `3a9f6ee2df1173f70720903f7115ef7fe4021f3e443e6acaa0965f014ba48d33` | `1ef53d2a7101c1d9e6e155ec4a0db2772100b2fc7e71af57c8b5a75e3b087651` |
| baseline | Chemical Reactions and Moles          | `92638d931c04b2c184138bf4cf92bccb6fb45d46d410499cdb69cf1eaa36077d` | `6907c7cdf2423c5aae0caf0a0d03f086802289d5d19bcc4f14d53a58f6af4093` |
| baseline | Mendelian Genetics                    | `aa025b79aa0e33bc7fcb8356ed1e82009910d249b17e70559c06fe1c64fb9947` | `060b79ae1fe8f02fb2f113a77fa2efdfd96f99d2aa323e56f0a45a6253192c7a` |
| baseline | Supply Demand and Price Controls      | `eb24d52f54781d2b5d9595c7e31733c33206c1cdcfc3bf376767f57e0183e4e0` | `371168388f919757adaf6e56feac063178548756109a2839493d0e7d1e28dffc` |
| baseline | Industrial Revolution Source Analysis | `55e5447a0536e024bbcd5aab65f5f547e5c29a08cbe0e0a28a30982d07535cff` | `06af23238247684f32a6232f91e08036d9961b627f066d0272e6f7f72d11a0dc` |
| baseline | Close Reading of Ozymandias           | `64f54a3f7b8ec7a25eb6685b7913ed250c3b72a25c9ebb53163299b6debb5f16` | `2a25c3054893606bb3e7147eeee5d3bc27a58b6c4197582c2c6da69b9f07b7e7` |
| baseline | Spanish Introductions for Beginners   | `c595abddb7f79a50aec188d0e03c444a87c40c60baf8628c1a9d9d3aa81361cf` | `6b0400e85591e5b8f2ae6c8e21c8d403b605cbacb1ba1798532cf7f6dba7df00` |
| baseline | Ecology and Experimental Design       | `57cb6704e41c1f2f65f5ea8280e89a7975d86b15f7e07ef4b43437ac17003e17` | `f031eb946bf7f40d4a80a8cc13138095db67aaf15aae90ffbccf86f6de8834da` |
| after    | Descriptive Statistics                | `2e6b224009053c949f23a98a401961d5ebace69fa21c8c67b1f701d7eaf96066` | `1d3a3cc12b01fb6453995eaac0976e5779c97a800b097a8645e898a8cdd8452d` |
| after    | Supply Demand and Price Controls      | `ddc0af4b1cb74c358f4dfc35520b079439d37d1903df6967afd0a1cb959f9864` | `cdd1cbd8a9f548560da87880a2c39290a030568d60f1c15c474f1314bce89f46` |
| after    | Industrial Revolution Source Analysis | `0b77c676c7bac2bda30a37f1c85523de25ce448a2b03b8f695aff77a24844d9b` | `7dd0d033b3ef8141a9a26793cc6a97233a99ddcda39b3c779b2bd0b1ef4c05b6` |
| after    | Close Reading of Ozymandias           | `0827adf8d382bd691155801cb944e13938be489287c100c65c094193817e8336` | `a9c5230c8e41c838898b64c08df41aeced79b107559933f071cfb51198694a29` |
| after    | Spanish Introductions for Beginners   | `0de0260181c70e114a10ccdc5f5043ae3b0105872bf5451afaac35f9255b2abb` | `83946b965a4998bf572739ed83702f967fc7201eee585b8db879f71045e358dd` |
