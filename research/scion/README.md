# Scion adapter research

These standalone Python tools are retained from the source audit for further Gemma adapter work. They are not part of the website runtime or a released adapter.

The live free Google Gemma route cannot load our LoRA adapters. The optional browser route currently uses the Gemma 4 E2B base model. Neither route should be described as our trained model.

The audit found a completion-target masking bug: right padding could enter the training loss, and the assistant header search could select an earlier or partial occurrence. The trainer now combines shifted attention masks with the last complete assistant header. Four NumPy regression tests exercise the production expression without loading model weights:

```sh
python3 -m pip install 'numpy>=2,<3'
python3 research/scion/test_completion_target_mask.py
```

This verifies masking, not training convergence, learning gains or adapter quality. Further training requires an isolated Python environment with the matching MLX/MLX-VLM tooling, exact base revision, reproducible dataset and a held-out evaluation. Do not promote an adapter based on training loss or its own model's quality score. Older local checkpoint directories remain untouched; provenance and compatibility must be checked before reuse.
