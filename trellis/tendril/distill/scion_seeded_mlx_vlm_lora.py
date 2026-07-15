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


def parse_seeded_args(argv: list[str]) -> tuple[int, list[str]]:
    if "--scion-seed" not in argv:
        raise ValueError("--scion-seed is required")
    index = argv.index("--scion-seed")
    if index + 1 >= len(argv):
        raise ValueError("--scion-seed requires an integer")
    try:
        seed = int(argv[index + 1])
    except ValueError as error:
        raise ValueError("--scion-seed requires an integer") from error
    if seed < 0 or seed > 0xFFFFFFFF:
        raise ValueError("--scion-seed must be between 0 and 4294967295")
    forwarded = argv[:index] + argv[index + 2 :]
    if forwarded and forwarded[0] == "--":
        forwarded = forwarded[1:]
    return seed, forwarded


def launch(seed: int, forwarded: list[str]) -> None:
    import mlx.core as mx
    import numpy as np

    np.random.seed(seed)
    mx.random.seed(seed)
    sys.argv = ["mlx_vlm.lora", *forwarded]
    runpy.run_module("mlx_vlm.lora", run_name="__main__", alter_sys=True)


def main(argv: list[str]) -> None:
    if argv == ["--inspect-toolchain"]:
        print(json.dumps(inspect_toolchain(), sort_keys=True, separators=(",", ":")))
        return
    if argv == ["--self-test"]:
        seed, forwarded = parse_seeded_args(
            ["--scion-seed", "16031", "--", "--train-mode", "orpo"]
        )
        print(
            json.dumps(
                {
                    "status": "pass",
                    "seed": seed,
                    "forwarded": forwarded,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return
    seed, forwarded = parse_seeded_args(argv)
    launch(seed, forwarded)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (ValueError, RuntimeError) as error:
        raise SystemExit(f"REFUSING: {error}") from error
