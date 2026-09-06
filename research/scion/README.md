# Scion adapter research

These standalone Python tools are retained from the source audit for further Gemma adapter work. They are not part of the website runtime or a released adapter.

The shared online route is paused. The production browser route uses the pinned Gemma 4 E2B base model locally; no installed adapter was available for this audit. It must not be described as a newly trained model.

The audit found a completion-target masking bug: right padding could enter the training loss, and the assistant header search could select an earlier or partial occurrence. The trainer now combines shifted attention masks with the last complete assistant header. Four NumPy regression tests exercise the production expression without loading model weights:

```sh
python3 -m pip install 'numpy>=2,<3'
python3 research/scion/test_completion_target_mask.py
```

This verifies masking, not training convergence, learning gains or adapter quality. Further training requires an isolated Python environment with the matching MLX/MLX-VLM tooling, exact base revision, reproducible dataset and a held-out evaluation. Do not promote an adapter based on training loss or its own model's quality score. Older local checkpoint directories remain untouched; provenance and compatibility must be checked before reuse.

## v0.19 source-to-task experiments (in progress)

`taskDesignProtocol.js` and `taskDesignProtocolV2.js` are research protocols, not production task generators. The raw final responses in `evaluation/v0.19.0/` include unsuccessful attempts:

- Initial count selection chose 12 of 30 correctly but restated a known observation instead of explaining the missing outcomes.
- Three v1 design probes passed structure and quotation checks; the experimental repair was still inadequate and some unknowns/feedback were unhelpful.
- V2 separated observed integer counts from compiler arithmetic. Without thinking, pooled and household counts were selected correctly, but both outputs copied an extra schema property; one source analysis produced malformed JSON. The cache experiment returned valid JSON and exact quotes while retaining the confounded procedure and inventing a measurement gap.

These failures are evidence against equating JSON validity or quotation fidelity with educational correctness. No protocol was promoted on that basis. Completed thinking, sampling, compact-template and native-runtime comparisons are recorded in [the v0.19.0 investigation](evaluation/v0.19.0/README.md). Thinking remains off by default; the two native E2B checks exactly matched browser final responses. Google documents an explicit thinking control for E2B in its [thinking guide](https://ai.google.dev/gemma/docs/capabilities/thinking) and lists sampling recommendations in the [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4). Recommendations are hypotheses for this workload, not measured improvements here.
