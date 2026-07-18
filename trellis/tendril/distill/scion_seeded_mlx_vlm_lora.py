#!/usr/bin/env python3
"""Seed and launch the exact MLX-VLM ORPO trainer used by Scion.

mlx_vlm.lora 0.6.3 does not expose a seed argument even though its ORPO
trainer shuffles with NumPy and initializes LoRA tensors with MLX randomness.
This narrow wrapper sets both generators before importing the trainer module.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import inspect
import json
import platform
import runpy
import sys
from pathlib import Path


PACKAGE_NAMES = (
    "mlx",
    "mlx-vlm",
    "numpy",
    "transformers",
    "huggingface-hub",
    "safetensors",
    "datasets",
    "pyarrow",
    "tokenizers",
)
MODULE_NAMES = (
    "mlx_vlm.lora",
    "mlx_vlm.trainer.lora",
    "mlx_vlm.trainer.orpo_trainer",
    "mlx_vlm.trainer.datasets",
    "mlx_vlm.prompt_utils",
    "mlx_vlm.models.gemma4.processing_gemma4",
)
GEMMA4_ASSISTANT_HEADER_IDS = (105, 4368, 107)  # <|turn>model\n


def sha256_file(file_path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(file_path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_toolchain() -> dict:
    modules = {}
    for module_name in MODULE_NAMES:
        module = __import__(module_name, fromlist=["*"])
        source_path = inspect.getsourcefile(module)
        if not source_path:
            raise RuntimeError(f"toolchain module has no inspectable source: {module_name}")
        modules[module_name] = {"sha256": sha256_file(source_path)}
    return {
        "schemaVersion": 1,
        "protocol": "scion-mlx-orpo-toolchain-receipt-v1",
        "platform": {
            "system": platform.system(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "packages": {
            name: importlib.metadata.version(name)
            for name in PACKAGE_NAMES
        },
        "modules": modules,
    }


def _pop_required_arg(argv: list[str], flag: str) -> tuple[str, list[str]]:
    if flag not in argv:
        raise ValueError(f"{flag} is required")
    index = argv.index(flag)
    if index + 1 >= len(argv):
        raise ValueError(f"{flag} requires a value")
    return argv[index + 1], argv[:index] + argv[index + 2 :]


def parse_seeded_args(argv: list[str]) -> tuple[int, str, list[str]]:
    seed_value, remaining = _pop_required_arg(argv, "--scion-seed")
    try:
        seed = int(seed_value)
    except ValueError as error:
        raise ValueError("--scion-seed requires an integer") from error
    if seed < 0 or seed > 0xFFFFFFFF:
        raise ValueError("--scion-seed must be between 0 and 4294967295")
    validation_split, forwarded = _pop_required_arg(
        remaining, "--scion-validation-split"
    )
    if not validation_split.replace("-", "").replace("_", "").isalnum():
        raise ValueError("--scion-validation-split must be a simple split name")
    if forwarded and forwarded[0] == "--":
        forwarded = forwarded[1:]
    return seed, validation_split, forwarded


def _forwarded_value(forwarded: list[str], flag: str) -> str:
    if flag not in forwarded:
        raise ValueError(f"forwarded trainer arguments require {flag}")
    index = forwarded.index(flag)
    if index + 1 >= len(forwarded):
        raise ValueError(f"forwarded trainer argument {flag} requires a value")
    return forwarded[index + 1]


def _last_subsequence_start(values, needle) -> int:
    """Return the last exact marker position, or -1 when it is absent."""
    values = list(values)
    needle = list(needle)
    if not needle or len(needle) > len(values):
        return -1
    for index in range(len(values) - len(needle), -1, -1):
        if values[index : index + len(needle)] == needle:
            return index
    return -1


def _completion_prediction_starts(input_ids, assistant_header_ids=GEMMA4_ASSISTANT_HEADER_IDS):
    """Locate where logits first predict assistant content for every row.

    MLX-VLM 0.6.3 accepts only one assistant token id and searches for its
    first occurrence. Gemma 4 uses a three-token role header, and ordinary
    prompt text can contain the token `model`. We therefore bind completion
    masking to the last full `<|turn>model\n` marker. The final header token is
    the input position whose logits predict the first assistant-content token.
    """
    starts = []
    for row in input_ids:
        marker_start = _last_subsequence_start(row, assistant_header_ids)
        if marker_start < 0:
            raise RuntimeError("Gemma 4 assistant turn header is missing from an ORPO sequence")
        starts.append(marker_start + len(assistant_header_ids) - 1)
    return starts


def _preflight_dataset_sequences(dataset_path: str, model_path: str, splits, max_sequence_length: int) -> dict:
    """Refuse silent right-edge truncation before the trainer allocates weights."""
    from datasets import load_dataset
    from transformers import AutoTokenizer
    from mlx_vlm.prompt_utils import apply_chat_template

    config = json.loads((Path(model_path) / "config.json").read_text())
    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
    maximum = 0
    sequences = 0
    for split in splits:
        dataset = load_dataset(dataset_path, split=split)
        for row_index, row in enumerate(dataset):
            for side in ("chosen", "rejected"):
                sequence = row.get(side)
                if not isinstance(sequence, list) or len(sequence) < 2:
                    raise RuntimeError(
                        f"ORPO {split} row {row_index} {side} is not a user/assistant conversation"
                    )
                prompt = apply_chat_template(
                    tokenizer,
                    config,
                    sequence,
                    add_generation_prompt=False,
                    num_images=0,
                )
                input_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
                token_count = len(input_ids)
                maximum = max(maximum, token_count)
                sequences += 1
                if token_count > max_sequence_length:
                    raise RuntimeError(
                        f"ORPO {split} row {row_index} {side} has {token_count} tokens, "
                        f"exceeding max sequence length {max_sequence_length}"
                    )
                start = _completion_prediction_starts([input_ids])[0]
                if token_count - start - 1 < 1:
                    raise RuntimeError(
                        f"ORPO {split} row {row_index} {side} has no assistant completion"
                    )
    if sequences == 0:
        raise RuntimeError("ORPO dataset preflight found no training sequences")
    return {"sequences": sequences, "maximumTokens": maximum}


def launch(seed: int, validation_split: str, forwarded: list[str]) -> None:
    import mlx.core as mx
    import mlx.nn as nn
    import numpy as np
    from datasets import load_dataset
    from mlx_vlm.trainer import orpo_trainer

    np.random.seed(seed)
    mx.random.seed(seed)
    dataset_path = _forwarded_value(forwarded, "--dataset")
    model_path = _forwarded_value(forwarded, "--model-path")
    training_split = _forwarded_value(forwarded, "--split")
    max_sequence_length = int(_forwarded_value(forwarded, "--max-seq-length"))
    _preflight_dataset_sequences(
        dataset_path,
        model_path,
        [training_split, validation_split],
        max_sequence_length,
    )
    original_train_orpo = orpo_trainer.train_orpo
    original_get_logps = orpo_trainer.get_logps

    def get_logps_with_exact_completion_boundary(
        model, batch, train_on_completions=False, assistant_id=77091
    ):
        if not train_on_completions:
            return original_get_logps(
                model,
                batch,
                train_on_completions=False,
                assistant_id=assistant_id,
            )

        pixel_values = batch["pixel_values"]
        input_ids = batch["input_ids"]
        attention_mask = batch["attention_mask"]
        batch_size, _ = input_ids.shape
        shifted_input_ids = input_ids[:, :-1]
        shifted_attention_mask = attention_mask[:, :-1]
        targets = input_ids[:, 1:]
        kwargs = {
            key: value
            for key, value in batch.items()
            if key not in ["input_ids", "pixel_values", "attention_mask"]
        }
        outputs = model(shifted_input_ids, pixel_values, shifted_attention_mask, **kwargs)
        logits = outputs.logits.astype(mx.float32)
        if logits.shape[1] < targets.shape[1]:
            pad_length = targets.shape[1] - logits.shape[1]
            logits = mx.pad(
                logits,
                ((0, 0), (0, pad_length), (0, 0)),
                mode="constant",
                constant_values=-100,
            )
        elif logits.shape[1] > targets.shape[1]:
            logits = logits[:, -targets.shape[1] :, :]

        lengths = mx.minimum(
            mx.sum(shifted_attention_mask, axis=1), shifted_input_ids.shape[1]
        )
        steps = mx.arange(shifted_input_ids.shape[1])[None, :]
        base_mask = steps < lengths[:, None]
        input_ids_np = np.array(input_ids)
        starts = _completion_prediction_starts(input_ids_np.tolist())
        if len(starts) != batch_size:
            raise RuntimeError("Gemma 4 completion boundary count does not match the ORPO batch")
        completion_mask = steps >= mx.array(starts).reshape(-1, 1)
        mask = mx.where(completion_mask, base_mask, mx.zeros_like(base_mask))
        if bool(np.any(np.array(mask.sum(-1)) <= 0)):
            raise RuntimeError("Gemma 4 ORPO sequence has no trainable assistant completion tokens")

        log_probs = -nn.losses.cross_entropy(logits, targets, reduction="none")
        mask_f = mask.astype(log_probs.dtype)
        token_counts = mx.maximum(mask_f.sum(-1), 1)
        logp_seq_avg = (log_probs * mask_f).sum(-1) / token_counts
        logits_mean = logits.sum() / mx.maximum(mask_f.sum(), 1)
        return logp_seq_avg, logits_mean

    def train_orpo_with_validation(*, train_dataset, val_dataset=None, **kwargs):
        if val_dataset is not None:
            raise RuntimeError("upstream trainer unexpectedly supplied validation data")
        raw_validation = load_dataset(dataset_path, split=validation_split)
        if len(raw_validation) == 0:
            raise RuntimeError(f"validation split is empty: {validation_split}")
        validation_dataset = train_dataset.__class__(
            raw_validation,
            train_dataset.config,
            train_dataset.processor,
            image_resize_shape=train_dataset.image_resize_shape,
        )
        return original_train_orpo(
            train_dataset=train_dataset,
            val_dataset=validation_dataset,
            **kwargs,
        )

    orpo_trainer.train_orpo = train_orpo_with_validation
    orpo_trainer.get_logps = get_logps_with_exact_completion_boundary
    sys.argv = ["mlx_vlm.lora", *forwarded]
    try:
        runpy.run_module("mlx_vlm.lora", run_name="__main__", alter_sys=True)
    finally:
        orpo_trainer.train_orpo = original_train_orpo
        orpo_trainer.get_logps = original_get_logps


def main(argv: list[str]) -> None:
    if argv == ["--inspect-toolchain"]:
        print(json.dumps(inspect_toolchain(), sort_keys=True, separators=(",", ":")))
        return
    if argv == ["--self-test"]:
        seed, validation_split, forwarded = parse_seeded_args(
            [
                "--scion-seed",
                "16031",
                "--scion-validation-split",
                "validation",
                "--",
                "--train-mode",
                "orpo",
            ]
        )
        print(
            json.dumps(
                {
                    "assistantHeaderIds": list(GEMMA4_ASSISTANT_HEADER_IDS),
                    "completionPredictionStarts": _completion_prediction_starts(
                        [[2, *GEMMA4_ASSISTANT_HEADER_IDS, 11, 12, 106]]
                    ),
                    "status": "pass",
                    "seed": seed,
                    "validationSplit": validation_split,
                    "forwarded": forwarded,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return
    seed, validation_split, forwarded = parse_seeded_args(argv)
    launch(seed, validation_split, forwarded)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (ValueError, RuntimeError) as error:
        raise SystemExit(f"REFUSING: {error}") from error
