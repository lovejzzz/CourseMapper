#!/bin/zsh
# L9: DPO from the deployed skin checkpoint (s3-800) on the 105 natural
# gate-verdict preference pairs. Ship-only-if-better on the FROZEN gate bench
# (skin holder 71.7 = qwen s3-800; blend holder 83.3 = smol S2; routed 77.5).
# mlx-lm-lora 2.1.0 in .venv-dpo (tokenizer_utils shimmed for transformers 5.x).
set -e
cd "$(dirname "$0")/../../.."

trellis/tendril/.venv-dpo/bin/python -m mlx_lm_lora.train \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --train \
  --train-mode dpo \
  --data trellis/tendril/distill/data-dpo \
  --resume-adapter-file trellis/tendril/distill/adapters-s3-800/adapters.safetensors \
  --adapter-path trellis/tendril/distill/adapters-dpo \
  --mask-prompt \
  --beta 0.1 \
  --batch-size 2 \
  --iters 200 \
  --save-every 100 \
  --seed 7

echo "=== DPO training done; generating held-out outputs ==="
S_BASE=Qwen/Qwen2.5-0.5B-Instruct \
S_ADAPTERS=trellis/tendril/distill/adapters-dpo \
S_OUT=trellis/tendril/distill/outputs/qwen-dpo.jsonl \
trellis/tendril/.venv/bin/python trellis/tendril/distill/gen_test.py

echo "=== gate bench ==="
npx vite-node trellis/tendril/distill/gateBench.mjs
