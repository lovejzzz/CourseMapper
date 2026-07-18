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
import math
import platform
import runpy
import sys
import time
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
SCION_LOGIT_CHUNK_TOKENS = 32


def _orpo_scalar_objective_and_coefficients(
    chosen_logp: float,
    rejected_logp: float,
    beta: float,
    eps: float,
) -> tuple[float, float, float]:
    """Return ORPO loss and exact dL/dlogp coefficients for batch size one."""
    chosen = min(chosen_logp, -eps)
    rejected = min(rejected_logp, -eps)
    chosen_log_odds = chosen - math.log1p(-math.exp(chosen))
    rejected_log_odds = rejected - math.log1p(-math.exp(rejected))
    log_odds_ratio = chosen_log_odds - rejected_log_odds
    negative_ratio = -log_odds_ratio
    preference_loss = max(negative_ratio, 0.0) + math.log1p(
        math.exp(-abs(negative_ratio))
    )
    sigmoid_negative_ratio = (
        math.exp(-log_odds_ratio) / (1.0 + math.exp(-log_odds_ratio))
        if log_odds_ratio >= 0
        else 1.0 / (1.0 + math.exp(log_odds_ratio))
    )
    preference_slope = -beta * sigmoid_negative_ratio
    chosen_coefficient = -1.0 + preference_slope / (1.0 - math.exp(chosen))
    rejected_coefficient = -preference_slope / (1.0 - math.exp(rejected))
    return (
        -chosen + beta * preference_loss,
        chosen_coefficient,
        rejected_coefficient,
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


def _mlx_completion_prediction_starts(input_ids, mx):
    """Locate the last Gemma assistant header without materializing an array.

    `get_logps` runs inside MLX's value-and-gradient transform. Converting its
    arrays through NumPy (or calling `mx.eval`) is forbidden there, so the
    production mask must remain an MLX expression until the trainer evaluates
    the completed loss graph.
    """
    marker_width = len(GEMMA4_ASSISTANT_HEADER_IDS)
    if input_ids.shape[1] < marker_width:
        raise RuntimeError("Gemma 4 ORPO sequence is shorter than the assistant header")
    window_count = input_ids.shape[1] - marker_width + 1
    matches = input_ids[:, :window_count] == GEMMA4_ASSISTANT_HEADER_IDS[0]
    for offset, token_id in enumerate(GEMMA4_ASSISTANT_HEADER_IDS[1:], start=1):
        matches = mx.logical_and(
            matches,
            input_ids[:, offset : input_ids.shape[1] - marker_width + offset + 1] == token_id,
        )
    positions = mx.arange(matches.shape[1])[None, :]
    marker_starts = mx.max(mx.where(matches, positions, -1), axis=1)
    return marker_starts + marker_width - 1


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
        embedding_features = model.get_input_embeddings(
            input_ids=shifted_input_ids,
            pixel_values=pixel_values,
            **kwargs,
        )
        hidden = model.language_model.model(
            inputs=None,
            inputs_embeds=embedding_features.inputs_embeds,
            per_layer_inputs=embedding_features.per_layer_inputs,
        )
        if hidden.shape[1] != targets.shape[1]:
            raise RuntimeError(
                "Gemma 4 hidden-state length does not match the ORPO target length"
            )

        def chunk_logps(chunk_hidden, chunk_targets):
            # Gemma 4's 262k-token vocabulary makes full-sequence float32
            # logits several gigabytes per preference side. Recompute bounded
            # logit chunks during backward instead of retaining that tensor.
            chunk_logits = model.language_model.logits_from_hidden(chunk_hidden)
            chunk_logits = chunk_logits.astype(mx.float32)
            return -nn.losses.cross_entropy(
                chunk_logits,
                chunk_targets,
                reduction="none",
            )

        log_prob_chunks = []
        for chunk_start in range(0, targets.shape[1], SCION_LOGIT_CHUNK_TOKENS):
            chunk_end = min(
                chunk_start + SCION_LOGIT_CHUNK_TOKENS,
                targets.shape[1],
            )
            log_prob_chunks.append(
                mx.checkpoint(chunk_logps)(
                    hidden[:, chunk_start:chunk_end],
                    targets[:, chunk_start:chunk_end],
                )
            )
        log_probs = mx.concatenate(log_prob_chunks, axis=1)

        lengths = mx.minimum(
            mx.sum(shifted_attention_mask, axis=1), shifted_input_ids.shape[1]
        )
        steps = mx.arange(shifted_input_ids.shape[1])[None, :]
        base_mask = steps < lengths[:, None]
        starts = _mlx_completion_prediction_starts(input_ids, mx)
        completion_mask = steps >= starts.reshape(batch_size, 1)
        mask = mx.where(completion_mask, base_mask, mx.zeros_like(base_mask))

        mask_f = mask.astype(log_probs.dtype)
        token_counts = mx.maximum(mask_f.sum(-1), 1)
        logp_seq_avg = (log_probs * mask_f).sum(-1) / token_counts
        # The upstream metric is not part of the ORPO objective. Avoid
        # rematerializing full logits solely to report it.
        logits_mean = mx.array(0.0, dtype=log_probs.dtype)
        return logp_seq_avg, logits_mean

    def train_orpo_memory_bounded(
        *,
        model,
        optimizer,
        train_dataset,
        val_dataset,
        args,
        train_on_completions=False,
        assistant_id=77091,
        **_unused,
    ):
        """Train exact batch-one ORPO without retaining both model graphs."""
        from functools import partial

        from mlx.utils import tree_map
        from mlx_vlm.trainer.sft_trainer import _resolve_adapter_file
        from mlx_vlm.trainer.utils import Colors, save_adapter

        if args.batch_size != 1:
            raise RuntimeError("memory-bounded Scion ORPO requires batch size one")
        if args.gradient_accumulation_steps < 1:
            raise RuntimeError("Scion ORPO gradient accumulation must be at least one")
        world = mx.distributed.init()
        if world.size() != 1:
            raise RuntimeError("memory-bounded Scion ORPO is single-device only")
        if mx.metal.is_available():
            device_info = mx.device_info()
            mx.set_wired_limit(device_info["max_recommended_working_set_size"])

        print(
            f"{Colors.HEADER}Starting memory-bounded Scion ORPO..., "
            f"iterations: {args.iters}{Colors.ENDC}"
        )
        adapter_file = _resolve_adapter_file(args)
        model_state = [model.state, mx.random.state]

        @partial(mx.compile, inputs=model_state, outputs=model_state)
        def side_value_and_grad(batch):
            def side_logp():
                logps, _ = get_logps_with_exact_completion_boundary(
                    model,
                    batch,
                    train_on_completions=train_on_completions,
                    assistant_id=assistant_id,
                )
                return mx.mean(logps)

            return nn.value_and_grad(model, side_logp)()

        model.train()
        accumulated_grad = None
        accumulated_steps = 0
        losses = 0.0
        trained_tokens = 0
        report_tokens = 0
        report_steps = 0
        report_time = 0.0

        for iteration, batch in zip(
            range(1, args.iters + 1),
            orpo_trainer.iterate_batches(
                dataset=train_dataset,
                batch_size=args.batch_size,
                max_seq_length=args.max_seq_length,
                train=True,
            ),
        ):
            if val_dataset is not None and (
                iteration == 1
                or iteration % args.steps_per_eval == 0
                or iteration == args.iters
            ):
                validation_started = time.perf_counter()
                validation_loss = orpo_trainer.evaluate_orpo(
                    model=model,
                    dataset=val_dataset,
                    batch_size=args.batch_size,
                    num_batches=args.val_batches,
                    max_seq_length=args.max_seq_length,
                    loss_fn=orpo_trainer.orpo_loss,
                    train_on_completions=train_on_completions,
                    assistant_id=assistant_id,
                )
                model.train()
                print(
                    f"{Colors.OKCYAN}Iter {iteration}: Val loss "
                    f"{validation_loss:.3f}, Val took "
                    f"{time.perf_counter() - validation_started:.3f}s{Colors.ENDC}",
                    flush=True,
                )

            started = time.perf_counter()
            chosen_logp, chosen_grad = side_value_and_grad(batch["chosen"])
            mx.eval(chosen_logp, chosen_grad)
            mx.clear_cache()
            rejected_logp, rejected_grad = side_value_and_grad(batch["rejected"])
            mx.eval(rejected_logp, rejected_grad)
            mx.clear_cache()

            loss_value, chosen_coefficient, rejected_coefficient = (
                _orpo_scalar_objective_and_coefficients(
                    float(chosen_logp.item()),
                    float(rejected_logp.item()),
                    args.beta,
                    args.eps,
                )
            )
            combined_grad = tree_map(
                lambda chosen, rejected: (
                    chosen_coefficient * chosen + rejected_coefficient * rejected
                ),
                chosen_grad,
                rejected_grad,
            )
            mx.eval(combined_grad)
            accumulated_grad = (
                combined_grad
                if accumulated_grad is None
                else tree_map(
                    lambda total, current: total + current,
                    accumulated_grad,
                    combined_grad,
                )
            )
            accumulated_steps += 1
            mx.eval(accumulated_grad)

            should_update = (
                accumulated_steps == args.gradient_accumulation_steps
                or iteration == args.iters
            )
            if should_update:
                update_grad = tree_map(
                    lambda value: value / accumulated_steps,
                    accumulated_grad,
                )
                if args.grad_clip is not None:
                    update_grad = tree_map(
                        lambda value: mx.clip(value, -args.grad_clip, args.grad_clip),
                        update_grad,
                    )
                optimizer.update(model, update_grad)
                mx.eval(model.state, optimizer.state)
                accumulated_grad = None
                accumulated_steps = 0
                mx.clear_cache()

            token_count = int(
                np.array(
                    batch["chosen"]["attention_mask"].sum()
                    + batch["rejected"]["attention_mask"].sum()
                ).item()
            )
            losses += loss_value
            trained_tokens += token_count
            report_tokens += token_count
            report_steps += 1
            report_time += time.perf_counter() - started

            if iteration % args.steps_per_report == 0 or iteration == args.iters:
                learning_rate = (
                    optimizer.learning_rate.item()
                    if hasattr(optimizer.learning_rate, "item")
                    else args.learning_rate
                )
                print(
                    f"Iter {iteration}: Train loss {Colors.OKGREEN}"
                    f"{losses / report_steps:.3f}{Colors.ENDC}, "
                    f"Learning Rate {learning_rate:.3e}, "
                    f"It/sec {report_steps / report_time:.3f}, "
                    f"Tokens/sec {report_tokens / report_time:.3f}, "
                    f"Trained Tokens {trained_tokens}, "
                    f"Peak mem {mx.get_peak_memory() / 1e9:.3f} GB",
                    flush=True,
                )
                losses = 0.0
                report_tokens = 0
                report_steps = 0
                report_time = 0.0

            if iteration % args.steps_per_save == 0:
                save_adapter(model, adapter_file)
                checkpoint = adapter_file.parent / f"{iteration:07d}_adapters.safetensors"
                save_adapter(model, checkpoint)
                print(
                    f"{Colors.OKBLUE}Iter {iteration}: Saved adapter weights to "
                    f"{adapter_file} and {checkpoint}.{Colors.ENDC}",
                    flush=True,
                )

        save_adapter(model, adapter_file)
        print(f"{Colors.OKGREEN}Saved final adapter weights to {adapter_file}.{Colors.ENDC}")

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
        args = kwargs.get("args")
        if args is not None and args.grad_checkpoint:
            from mlx_vlm.trainer.utils import grad_checkpoint

            model = kwargs.get("model")
            language_model = getattr(model, "language_model", None)
            text_model = getattr(language_model, "model", None)
            decoder_layers = getattr(text_model, "layers", None)
            if not decoder_layers:
                raise RuntimeError(
                    "Gemma 4 gradient checkpointing could not find "
                    "model.language_model.model.layers"
                )
            # Bind checkpointing to the real decoder stack and fail closed if
            # upstream model aliases change, instead of trusting a loose
            # wrapper-level attribute check for this memory guarantee.
            grad_checkpoint(decoder_layers[0])
            args.grad_checkpoint = False
        return train_orpo_memory_bounded(
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
    if argv == ["--mlx-self-test"]:
        import mlx.core as mx

        compiled_starts = mx.compile(lambda values: _mlx_completion_prediction_starts(values, mx))(
            mx.array([[2, *GEMMA4_ASSISTANT_HEADER_IDS, 11, 12, 106]])
        )
        mx.eval(compiled_starts)
        print(
            json.dumps(
                {
                    "assistantHeaderIds": list(GEMMA4_ASSISTANT_HEADER_IDS),
                    "mlxCompiledCompletionPredictionStarts": compiled_starts.tolist(),
                    "status": "pass",
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return
    if argv == ["--self-test"]:
        sample_chosen = -2.0
        sample_rejected = -2.5
        finite_difference = 0.000001
        _, chosen_coefficient, rejected_coefficient = (
            _orpo_scalar_objective_and_coefficients(
                sample_chosen,
                sample_rejected,
                0.1,
                0.00000001,
            )
        )
        chosen_finite_difference = (
            _orpo_scalar_objective_and_coefficients(
                sample_chosen + finite_difference,
                sample_rejected,
                0.1,
                0.00000001,
            )[0]
            - _orpo_scalar_objective_and_coefficients(
                sample_chosen - finite_difference,
                sample_rejected,
                0.1,
                0.00000001,
            )[0]
        ) / (2 * finite_difference)
        rejected_finite_difference = (
            _orpo_scalar_objective_and_coefficients(
                sample_chosen,
                sample_rejected + finite_difference,
                0.1,
                0.00000001,
            )[0]
            - _orpo_scalar_objective_and_coefficients(
                sample_chosen,
                sample_rejected - finite_difference,
                0.1,
                0.00000001,
            )[0]
        ) / (2 * finite_difference)
        if not math.isclose(
            chosen_coefficient,
            chosen_finite_difference,
            rel_tol=0.00001,
            abs_tol=0.00001,
        ) or not math.isclose(
            rejected_coefficient,
            rejected_finite_difference,
            rel_tol=0.00001,
            abs_tol=0.00001,
        ):
            raise RuntimeError("memory-bounded ORPO gradient coefficients failed self-test")
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
