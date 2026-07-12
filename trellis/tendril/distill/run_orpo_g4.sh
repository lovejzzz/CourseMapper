#!/bin/zsh
# E2B-MAX V2.1 Workstream A3 — ORPO preference training on Gemma-4-E2B.
#
# PRECONDITIONS (roadmap §2, pre-registered — DO NOT run undersized):
#   1. data-g4-orpo/train.jsonl holds ≥3000 pairs (wc -l) built by
#      buildTeacherPairs.mjs with its poison filters (the 105-pair DPO r1
#      collapse and both SFT collapses are the reason this gate exists).
#   2. Phase-0 spike green (2026-07-07): ORPO trains/saves/serves on this
#      stack — mlx_vlm.lora, 13.2M LoRA params, adapter loads via
#      load(..., adapter_path).
#
# GATES per checkpoint (run each; a seat win that drifts ANY ruler is
# rejected; two ruler-rejected rounds re-retire the seat — roadmap C4):
#   LONGJSON=run npx vite-node trellis/tendril/distill/bench/longJsonBench.mjs
#   SCOREBOARD=run npx vite-node trellis/researcher/scoreboard.mjs
#   EDU_BAR=run npx vite-node trellis/researcher/eduBar.mjs
#   npm run local-model  (G4_ADAPTERS=<checkpoint>) + one crucible round +
#   pooled ≥12-seat panels vs the paid baseline (BAKEOFF addendum 4 protocol).
set -e
cd "$(dirname "$0")/../../.."

node scripts/scionPreferenceCorpusAudit.mjs
CURATED=trellis/tendril/distill/data-g4-orpo/curated/train.jsonl
PAIRS=$(wc -l < "$CURATED" 2>/dev/null || echo 0)
if [ "$PAIRS" -lt 3000 ] && [ "$1" != "--smoke" ]; then
  echo "REFUSING: $PAIRS verified pairs < 3000 (the pre-registered training gate)."
  echo "Grow the corpus: PAIRS=run npx vite-node trellis/tendril/distill/buildTeacherPairs.mjs extended"
  echo "Rows without pair-level preference evidence remain quarantined and never train Scion."
  echo "(--smoke overrides for a 10-iter mechanical check only — never adopt a smoke adapter.)"
  exit 1
fi

ITERS=${ITERS:-600}
[ "$1" = "--smoke" ] && ITERS=10

trellis/tendril/.venv-g4/bin/python -m mlx_vlm.lora \
  --model-path google/gemma-4-e2b-it \
  --dataset trellis/tendril/distill/data-g4-orpo/curated \
  --split train \
  --train-mode orpo \
  --iters "$ITERS" \
  --batch-size 2 \
  --steps-per-report 20 \
  --steps-per-save 100 \
  --lora-rank 16 \
  --output-path trellis/tendril/distill/adapters-g4-orpo

echo "=== training done — run the checkpoint gates before ANY adoption ==="
echo "serve a checkpoint: G4_ADAPTERS=trellis/tendril/distill/adapters-g4-orpo npm run local-model"
