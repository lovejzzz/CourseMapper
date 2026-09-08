# Rejected automatic teaching-focus experiment

The candidate patch is based on `78e068e2`. It is retained for investigation, **not enabled in the application**. Applying it introduces a one-call, 64-token, grammar-constrained focus selector plus an optional review UI stage. It selects one of four existing operation contracts or null. Source selection and human confirmation remain separate.

The first real application trial used exposed `source-dev-07`: focus selection took 5,929 ms including 4,499 ms loading, and source binding took 6,283 ms with the loaded model. Both took one call. The draft reopened and applied after developer review with no source-role corrections. This success did not establish general suitability.

Before broader execution, `screening-plan.json` fixed all sixteen existing development inputs in filename order, one call each, no repairs. The harness reads only their objectives and original source records, never evaluator references. It runs serially in one browser and unloads the model in `finally`.

The resulting selector **never chose null**. Only the two experimental-design cases and `source-dev-07` met one of the four implemented contracts. Thirteen other cases were wrongly routed, including missing attachment text and a request for physical laboratory testing. `review.json` assesses fit to the current registry, not the broader v3 benchmark's required capabilities. Treating these rejections correctly would still not provide the missing capabilities.

Consequently all candidate application changes were removed. Do not reintroduce this as a product default on the strength of its schema checks or single successful case. Source-role validity, objective coverage and executable preconditions must establish a usable candidate before presenting it as a supported task. A classifier label alone is insufficient.

Receipts preserve raw prompts, outputs, runtime/model identity and timing. Verbose tokenizer metadata is omitted from committed copies; the original screening download and its hash are recorded in `review.json`. The original local projects and the successful applied trial remain under `.audit-work/v0200-teaching-system/focus-selection-01/`. These are exposed development trials, not fresh acceptance units or independent classroom evidence.

To reproduce the historical candidate, apply the patch to the recorded base in an isolated checkout, serve this repository locally, and open `screening.html` there. The patch must be present because the harness imports its experimental module. No hosted inference, adapter training or paid service was used.
