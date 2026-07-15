# Scion B/A fresh-task workbook

This directory is the complete allowed input set for the reverse-order judgment. Use it only in one genuinely fresh Codex task that has not read or received the earlier A/B task, transcript, event log, template, sealed envelope, key, plaintext, decision, organizer mapping, unblinded model identity, outcome, or aggregate.

If any prohibited input is available in this task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Review schedule

Read and follow `single-model-training-atom-judge-prompt-v2.md`. The 128-case pass is divided into small immutable chunks so work can be checked and resumed without editing one giant file. Cases are deterministically interleaved from the canonical packet to distribute domains across the schedule.

- `chunk-01-review-b-a.json` + `chunk-01-decisions-b-a.json` — 16 anonymous cases
- `chunk-02-review-b-a.json` + `chunk-02-decisions-b-a.json` — 16 anonymous cases
- `chunk-03-review-b-a.json` + `chunk-03-decisions-b-a.json` — 16 anonymous cases
- `chunk-04-review-b-a.json` + `chunk-04-decisions-b-a.json` — 16 anonymous cases
- `chunk-05-review-b-a.json` + `chunk-05-decisions-b-a.json` — 16 anonymous cases
- `chunk-06-review-b-a.json` + `chunk-06-decisions-b-a.json` — 16 anonymous cases
- `chunk-07-review-b-a.json` + `chunk-07-decisions-b-a.json` — 16 anonymous cases
- `chunk-08-review-b-a.json` + `chunk-08-decisions-b-a.json` — 16 anonymous cases

Create a working directory and copy only the blank decisions skeletons:

```bash
mkdir -p verification-output/scion-codex-fresh-b-a-working
cp evaluation/scion-adapters/handoffs/fresh-b-a-workbook-v0.16.30/chunk-*-decisions-b-a.json verification-output/scion-codex-fresh-b-a-working/
```

Process chunks in numeric order. For each case, score both artifacts before recording `winner`, `tie`, or `insufficient-evidence`. Preserve real ties, low-quality relative winners, and insufficient evidence. Do not manufacture a training preference.

Every completed chunk must carry the same exact judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.

## Assemble and seal without a combined plaintext pass

From the repository root, run:

```bash
npm run complete:scion:codex-fresh-pass -- \
  --handoff evaluation/scion-adapters/handoffs/fresh-b-a-workbook-v0.16.30 \
  --receipt evaluation/scion-adapters/evidence/fresh-b-a-workbook-v0.16.30.json \
  --decisions-dir verification-output/scion-codex-fresh-b-a-working \
  --sealed-output verification-output/scion-codex-sealed-passes/v0.16.30-b-a.sealed.json \
  --key-output ~/.codex/scion-secrets/CourseMapper/v0.16.30-b-a.key
```

The command re-verifies every immutable chunk and the tracked receipt, rejects missing or extra working files, validates each completed chunk, requires one identical fresh judge session across all chunks, reconstructs canonical case order in memory, and creates only one AES-256-GCM envelope plus one 0600 key. It never writes the combined completed 128-case pass.

Return only the sealed envelope path, a separately transferred key path, and the outcome-sealed validation summary. Do not unseal or ingest either order inside the fresh judge task.
