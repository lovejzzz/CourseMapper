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


def launch(seed: int, validation_split: str, forwarded: list[str]) -> None:
    import mlx.core as mx
    import numpy as np
    from datasets import load_dataset
    from mlx_vlm.trainer import orpo_trainer

    np.random.seed(seed)
    mx.random.seed(seed)
    dataset_path = _forwarded_value(forwarded, "--dataset")
    original_train_orpo = orpo_trainer.train_orpo

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
    sys.argv = ["mlx_vlm.lora", *forwarded]
    try:
        runpy.run_module("mlx_vlm.lora", run_name="__main__", alter_sys=True)
    finally:
        orpo_trainer.train_orpo = original_train_orpo


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
