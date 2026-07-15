# Scion A/B fresh-task workbook

This directory is the complete allowed input set for the first-order judgment. Use it only in one fresh Codex task that has not read or received any outcome, completed decision, organizer mapping, unblinded model identity, or reverse-order payload for this campaign.

If any prohibited input is available in the task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Identity preflight

Before scoring any case, verify that this task can honestly use model "openai/codex", revision "codex-gpt-5-2026-07-15", runtime "codex-desktop", and prompt SHA-256 "0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7". If any identity is unavailable or different, stop before judgment. Do not substitute a newer runtime or relabel it as the pinned identity.

## Review schedule

Read and follow `single-model-training-atom-judge-prompt-v2.md`. The 128-case A/B pass is divided into immutable chunks. Process chunks in numeric order. Score both anonymous artifacts before recording `winner`, `tie`, or `insufficient-evidence`. Preserve real ties, low-quality relative winners, and insufficient evidence. Do not manufacture a training preference.

- `chunk-01-review-a-b.json` + `chunk-01-decisions-a-b.json` — 16 anonymous cases
- `chunk-02-review-a-b.json` + `chunk-02-decisions-a-b.json` — 16 anonymous cases
- `chunk-03-review-a-b.json` + `chunk-03-decisions-a-b.json` — 16 anonymous cases
- `chunk-04-review-a-b.json` + `chunk-04-decisions-a-b.json` — 16 anonymous cases
- `chunk-05-review-a-b.json` + `chunk-05-decisions-a-b.json` — 16 anonymous cases
- `chunk-06-review-a-b.json` + `chunk-06-decisions-a-b.json` — 16 anonymous cases
- `chunk-07-review-a-b.json` + `chunk-07-decisions-a-b.json` — 16 anonymous cases
- `chunk-08-review-a-b.json` + `chunk-08-decisions-a-b.json` — 16 anonymous cases

Create a working directory and copy only the blank decisions skeletons:

```bash
mkdir -p verification-output/scion-codex-fresh-a-b-working-v0.16.35
cp evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.35/chunk-*-decisions-a-b.json verification-output/scion-codex-fresh-a-b-working-v0.16.35/
```

Every completed chunk must carry the same exact declared judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.

## Assemble and seal without a combined plaintext pass

From the repository root, run:

```bash
npm run complete:scion:codex-fresh-pass -- \
  --handoff evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.35 \
  --receipt evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.35.json \
  --decisions-dir verification-output/scion-codex-fresh-a-b-working-v0.16.35 \
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.35-a-b.sealed.json \
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.35-a-b.key
```

The command re-verifies every immutable chunk and the tracked receipt, rejects missing or extra working files, validates each completed chunk, requires one identical fresh judge session across all chunks, reconstructs canonical case order in memory, and creates only one AES-256-GCM envelope plus one 0600 key. It never writes the combined completed pass.

Return only the sealed envelope path, a separately transferred key path, and the outcome-sealed validation summary. Do not unseal, ingest, or begin the B/A order inside the first-order judge task.
