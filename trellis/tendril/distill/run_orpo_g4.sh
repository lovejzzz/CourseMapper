#!/bin/zsh
# E2B-MAX V2.1 Workstream A3 — ORPO preference training on Gemma-4-E2B.
#
# PRECONDITIONS (roadmap §2, pre-registered — DO NOT run undersized):
#   1. production: the manifest-bound curated split holds ≥3000 verified
#      pairs across five domains and fifteen course groups. Research mode is
#      separately labeled and requires ≥100 independently admissible pairs,
#      including ≥20 in each of four domains, and three course groups per
#      domain; it cannot promote.
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
set -euo pipefail
cd "$(dirname "$0")/../../.."

MODE=${1:-}
SMOKE=false
RESEARCH=false
[ "$MODE" = "--smoke" ] && SMOKE=true
[ "$MODE" = "--research" ] && RESEARCH=true
if [ -n "$MODE" ] && ! $SMOKE && ! $RESEARCH; then
  echo "REFUSING: unknown mode $MODE (expected --smoke or --research)."
  exit 1
fi

PYTHON=${SCION_TRAIN_PYTHON:-$HOME/.cache/coursemapper/venv-g4/bin/python}
DATASET_DIR=${SCION_ADAPTER_DATASET:-trellis/tendril/distill/data-g4-orpo/curated}
BASE_MODEL=google/gemma-4-E2B-it-qat-q4_0-unquantized
BASE_REVISION=1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce
MODEL_CACHE=${SCION_MODEL_CACHE:-$HOME/.cache/coursemapper/scion-models}
RUN_ID=${SCION_ADAPTER_ID:-scion-g4e2b-$(date -u +%Y%m%dT%H%M%SZ)}
OUTPUT=${SCION_ADAPTER_OUTPUT:-$HOME/.cache/coursemapper/scion-adapters/$RUN_ID}

if $SMOKE; then
  node scripts/scionAdapterDataset.mjs --output "$DATASET_DIR" --allow-smoke
elif $RESEARCH; then
  node scripts/scionAdapterDataset.mjs --output "$DATASET_DIR" --research
else
  node scripts/scionAdapterDataset.mjs --output "$DATASET_DIR"
fi

MANIFEST="$DATASET_DIR/dataset-manifest.json"
PAIRS=$(node -e 'const m=require(process.argv[1]); process.stdout.write(String(m.counts.total||0))' "$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")")
STATUS=$(node -e 'const m=require(process.argv[1]); process.stdout.write(String(m.status||"blocked"))' "$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")")
if [ "$PAIRS" -eq 0 ]; then
  echo "REFUSING: no verified adapter pairs are available."
  exit 1
fi
if $RESEARCH && [ "$STATUS" != "research-ready" ]; then
  echo "REFUSING: dataset status is $STATUS; research training requires research-ready."
  exit 1
fi
if ! $SMOKE && ! $RESEARCH && [ "$STATUS" != "ready" ]; then
  echo "REFUSING: dataset status is $STATUS; production training requires ready."
  exit 1
fi

ITERS=${ITERS:-600}
$SMOKE && ITERS=10

BASE_PATH=$(
  "$PYTHON" trellis/tendril/distill/prepare_adapter_base.py \
    --model "$BASE_MODEL" \
    --revision "$BASE_REVISION" \
    --cache-dir "$MODEL_CACHE"
)
mkdir -p "$OUTPUT"

"$PYTHON" -m mlx_vlm.lora \
  --model-path "$BASE_PATH" \
  --dataset "$DATASET_DIR" \
  --split train \
  --train-mode orpo \
  --iters "$ITERS" \
  --batch-size 2 \
  --steps-per-report 20 \
  --steps-per-save 100 \
  --lora-rank 16 \
  --output-path "$OUTPUT"

SCION_VERSION=$(node -p 'require("./package.json").version')
PACKAGE_STATUS=candidate
$SMOKE && PACKAGE_STATUS=smoke
$RESEARCH && PACKAGE_STATUS=research
node scripts/scionAdapterPackage.mjs \
  --adapter-dir "$OUTPUT" \
  --adapter-id "$RUN_ID" \
  --scion-version "$SCION_VERSION" \
  --dataset-manifest "$MANIFEST" \
  --status "$PACKAGE_STATUS" \
  --output "$OUTPUT/scion-adapter.json"

echo "=== training done — run the checkpoint gates before ANY adoption ==="
echo "adapter package: $OUTPUT/scion-adapter.json"
echo "serve a checkpoint: SCION_ADAPTER_MANIFEST=$OUTPUT/scion-adapter.json npm run local-model"
