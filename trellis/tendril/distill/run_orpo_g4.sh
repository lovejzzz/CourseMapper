#!/bin/zsh
# E2B-MAX V2.1 Workstream A3 — ORPO preference training on Gemma-4-E2B.
#
# PRECONDITIONS (roadmap §2, pre-registered — DO NOT run undersized):
#   1. production: either the general manifest-bound curated split holds ≥3000
#      verified pairs, or the task-scoped lesson-kernel lane passes its locked
#      ≥100-pair, source-grounded semantic admission and held-out firewall.
#      Research mode is separately labeled and cannot promote.
#   2. Phase-0 spike green (2026-07-07): ORPO trains/saves/serves on this
#      stack — mlx_vlm.lora, 26.3M rank-16 LoRA params, adapter loads via
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
LESSON_KERNEL_V01654=false
LESSON_KERNEL_V01662=false
[ "$MODE" = "--smoke" ] && SMOKE=true
[ "$MODE" = "--research" ] && RESEARCH=true
[ "$MODE" = "--lesson-kernel-v0.16.54" ] && LESSON_KERNEL_V01654=true
[ "$MODE" = "--lesson-kernel-v0.16.62" ] && LESSON_KERNEL_V01662=true
if [ -n "$MODE" ] && ! $SMOKE && ! $RESEARCH && ! $LESSON_KERNEL_V01654 && ! $LESSON_KERNEL_V01662; then
  echo "REFUSING: unknown mode $MODE (expected --smoke, --research, --lesson-kernel-v0.16.54, or --lesson-kernel-v0.16.62)."
  exit 1
fi

PYTHON=${SCION_TRAIN_PYTHON:-$HOME/.cache/coursemapper/venv-g4/bin/python}
BASE_MODEL=google/gemma-4-E2B-it-qat-q4_0-unquantized
BASE_REVISION=1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce
MODEL_CACHE=${SCION_MODEL_CACHE:-$HOME/.cache/coursemapper/scion-models}
OUTPUT_ROOT=${SCION_ADAPTER_OUTPUT_ROOT:-$HOME/.cache/coursemapper/scion-adapters}
RESEARCH_PREFERENCE_SOURCE=${SCION_RESEARCH_PREFERENCE_SOURCE:-evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.47-readiness-gap.jsonl}
SEED=${SCION_TRAIN_SEED:-16031}
LORA_RANK=${SCION_TRAIN_LORA_RANK:-16}
LORA_ALPHA=${SCION_TRAIN_LORA_ALPHA:-$LORA_RANK}
if [[ "$LORA_RANK" != <-> ]] || [ "$LORA_RANK" -le 0 ]; then
  echo "REFUSING: SCION_TRAIN_LORA_RANK must be a positive integer."
  exit 1
fi
if [[ "$LORA_ALPHA" != <-> ]] || [ "$LORA_ALPHA" -le 0 ]; then
  echo "REFUSING: SCION_TRAIN_LORA_ALPHA must be a positive integer."
  exit 1
fi
LANE=production
$SMOKE && LANE=smoke
$RESEARCH && LANE=research
COMMIT=$(git rev-parse HEAD^{commit})
DATASET_KEY=$LANE-$COMMIT
$LESSON_KERNEL_V01654 && DATASET_KEY=lesson-kernel-v01654-$COMMIT
$LESSON_KERNEL_V01662 && DATASET_KEY=lesson-kernel-v01662-$COMMIT
DATASET_DIR=${SCION_ADAPTER_DATASET:-$HOME/.cache/coursemapper/scion-datasets/$DATASET_KEY}
GENERATED_AT=$(git show -s --format=%cI HEAD)

if [ -n "${SCION_ADAPTER_ID:-}" ] || [ -n "${SCION_ADAPTER_OUTPUT:-}" ]; then
  echo "REFUSING: adapter ID and output directory are derived from the hash-bound training plan; use SCION_ADAPTER_OUTPUT_ROOT."
  exit 1
fi
if [ ! -x "$PYTHON" ]; then
  echo "REFUSING: pinned Scion training Python is unavailable: $PYTHON"
  exit 1
fi
mkdir -p "$DATASET_DIR" "$OUTPUT_ROOT"

if $SMOKE; then
  node scripts/scionAdapterDataset.mjs --output "$DATASET_DIR" --generated-at "$GENERATED_AT" --allow-smoke
elif $RESEARCH; then
  node scripts/scionAdapterDataset.mjs \
    --source "$RESEARCH_PREFERENCE_SOURCE" \
    --output "$DATASET_DIR" \
    --generated-at "$GENERATED_AT" \
    --research \
    --semantic-profile strict-v3
elif $LESSON_KERNEL_V01654; then
  node scripts/scionAdapterDataset.mjs \
    --profile lesson-kernel-v0.16.54 \
    --output "$DATASET_DIR" \
    --generated-at "$GENERATED_AT"
elif $LESSON_KERNEL_V01662; then
  node scripts/scionAdapterDataset.mjs \
    --profile lesson-kernel-v0.16.62 \
    --output "$DATASET_DIR" \
    --generated-at "$GENERATED_AT"
else
  node scripts/scionAdapterDataset.mjs --output "$DATASET_DIR" --generated-at "$GENERATED_AT"
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

DEFAULT_ITERS=600
$LESSON_KERNEL_V01654 && DEFAULT_ITERS=200
$LESSON_KERNEL_V01662 && DEFAULT_ITERS=200
ITERS=${ITERS:-$DEFAULT_ITERS}
$SMOKE && ITERS=10
MAX_SEQUENCE_LENGTH=4096
# The sealed v0.16.54 corpus has a measured maximum of 2,575 tokens. Keep a
# five-token safety margin while refusing any future silent truncation.
$LESSON_KERNEL_V01654 && MAX_SEQUENCE_LENGTH=2580
# The v0.16.62 production corpus has a measured maximum of 2,870 tokens
# across all 200 chosen/rejected sequences. Preserve a five-token margin.
$LESSON_KERNEL_V01662 && MAX_SEQUENCE_LENGTH=2875

BASE_PATH=$(
  "$PYTHON" trellis/tendril/distill/prepare_adapter_base.py \
    --model "$BASE_MODEL" \
    --revision "$BASE_REVISION" \
    --cache-dir "$MODEL_CACHE"
)
TOOLCHAIN_RECEIPT=$(mktemp "${TMPDIR:-/tmp}/scion-toolchain.XXXXXX")
trap 'rm -f "$TOOLCHAIN_RECEIPT"' EXIT
"$PYTHON" trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py --inspect-toolchain > "$TOOLCHAIN_RECEIPT"
"$PYTHON" trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py --mlx-self-test

PLAN_JSON=$(node scripts/scionAdapterTrainingRun.mjs \
  --plan \
  --lane "$LANE" \
  --dataset-manifest "$MANIFEST" \
  --base-snapshot "$BASE_PATH" \
  --toolchain-receipt "$TOOLCHAIN_RECEIPT" \
  --output-root "$OUTPUT_ROOT" \
  --seed "$SEED" \
  --iterations "$ITERS" \
  --max-sequence-length "$MAX_SEQUENCE_LENGTH" \
  --lora-rank "$LORA_RANK" \
  --lora-alpha "$LORA_ALPHA")
OUTPUT=$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.outputDir)' "$PLAN_JSON")
RUN_ID=$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.adapterId)' "$PLAN_JSON")
PLAN="$OUTPUT/training-plan.json"

set +e
"$PYTHON" trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py \
  --scion-seed "$SEED" \
  --scion-validation-split validation \
  -- \
  --model-path "$BASE_PATH" \
  --dataset "$DATASET_DIR" \
  --split train \
  --train-mode orpo \
  --iters "$ITERS" \
  --batch-size 1 \
  --learning-rate 0.00002 \
  --steps-per-report 1 \
  --steps-per-eval 200 \
  --steps-per-save 100 \
  --val-batches 4 \
  --max-seq-length "$MAX_SEQUENCE_LENGTH" \
  --grad-checkpoint \
  --train-on-completions \
  --gradient-accumulation-steps 2 \
  --lora-rank "$LORA_RANK" \
  --lora-alpha "$LORA_ALPHA" \
  --lora-dropout 0 \
  --beta 0.1 \
  --eps 0.00000001 \
  --output-path "$OUTPUT" 2>&1 | tee "$OUTPUT/training.log"
TRAIN_STATUS=$pipestatus[1]
set -e
if [ "$TRAIN_STATUS" -ne 0 ]; then
  echo "REFUSING: seeded Scion training failed; the incomplete plan remains non-packaged at $OUTPUT"
  exit "$TRAIN_STATUS"
fi

node scripts/scionAdapterTrainingRun.mjs --complete --plan-file "$PLAN"
RESULT="$OUTPUT/training-result.json"
node scripts/scionAdapterTrainingRun.mjs \
  --verify \
  --plan-file "$PLAN" \
  --result-file "$RESULT" \
  --dataset-manifest "$MANIFEST"

SCION_VERSION=$(node -p 'require("./package.json").version')
PACKAGE_STATUS=candidate
$SMOKE && PACKAGE_STATUS=smoke
$RESEARCH && PACKAGE_STATUS=research
node scripts/scionAdapterPackage.mjs \
  --adapter-dir "$OUTPUT" \
  --adapter-id "$RUN_ID" \
  --scion-version "$SCION_VERSION" \
  --dataset-manifest "$MANIFEST" \
  --training-plan "$PLAN" \
  --training-result "$RESULT" \
  --status "$PACKAGE_STATUS" \
  --output "$OUTPUT/scion-adapter.json"

node scripts/scionAdapterPackage.mjs --verify "$OUTPUT/scion-adapter.json"

echo "=== seeded, receipt-bound training done — run the checkpoint gates before ANY adoption ==="
echo "training plan: $PLAN"
echo "training result: $RESULT"
echo "adapter package: $OUTPUT/scion-adapter.json"
echo "serve a checkpoint: SCION_ADAPTER_MANIFEST=$OUTPUT/scion-adapter.json npm run local-model"
