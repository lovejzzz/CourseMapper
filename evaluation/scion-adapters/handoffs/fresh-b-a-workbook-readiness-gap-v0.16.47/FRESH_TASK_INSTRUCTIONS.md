# Scion B/A fresh-task workbook

This directory is the complete allowed input set for the reverse-order judgment. Use it only in one genuinely fresh Codex task that has not read or received the earlier A/B task, transcript, event log, template, sealed envelope, key, plaintext, decision, organizer mapping, unblinded model identity, outcome, or aggregate.

If any prohibited input is available in this task context, stop. Do not set the context-reset or no-prior-outcome attestations.

## Review schedule

Read and follow `single-model-training-atom-judge-prompt-v2.md`. The 15-case B/A pass is divided into immutable chunks. Cases are deterministically interleaved from the canonical packet to distribute domains across the schedule.

- `chunk-01-review-b-a.json` + `chunk-01-decisions-b-a.json` — 8 anonymous cases
- `chunk-02-review-b-a.json` + `chunk-02-decisions-b-a.json` — 7 anonymous cases

Create a working directory and copy only the blank decisions skeletons:

```bash
mkdir -p verification-output/scion-codex-fresh-b-a-working-readiness-gap-v0.16.47
cp evaluation/scion-adapters/handoffs/fresh-b-a-workbook-readiness-gap-v0.16.47/chunk-*-decisions-b-a.json verification-output/scion-codex-fresh-b-a-working-readiness-gap-v0.16.47/
```

Process chunks in numeric order. For each case, score both artifacts before recording `winner`, `tie`, or `insufficient-evidence`. For a positional win, set `preference.decision` to the exact token `winner` and set `winnerPosition` to `1` or `2`; never use `first-artifact` or `second-artifact` as decision tokens. Preserve real ties, low-quality relative winners, and insufficient evidence. Do not manufacture a training preference.

Every completed chunk must carry the same exact judge revision, runtime, fresh session ID, completion time, no-prior-outcome statement, context-reset attestation, and judgment attestation. Edit only the working decisions copies; never modify this hash-bound workbook.

Start one new ephemeral Codex CLI task with model `gpt-5.6-luna` and reasoning effort `max` selected explicitly. This workbook pins the outcome-independent public judge identity from the sealed first order. Before scoring any case, verify that this task can honestly use model "openai/codex", revision "gpt-5.6-luna@max", runtime "codex-cli-0.144.5", and prompt SHA-256 "0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7". The fresh session ID must differ from "019f6d60-d6b9-7ff3-b601-7ad07ec50ba2". If any identity is unavailable or different, stop before judgment; do not substitute another model, reasoning effort, runtime, or label. The revision is an auditable launch-profile token, not a claim about an unexposed provider build revision.

## Assemble and seal without a combined plaintext pass

From the repository root, run:

```bash
npm run complete:scion:codex-fresh-pass -- \
  --handoff evaluation/scion-adapters/handoffs/fresh-b-a-workbook-readiness-gap-v0.16.47 \
  --receipt evaluation/scion-adapters/evidence/fresh-b-a-workbook-readiness-gap-v0.16.47.json \
  --decisions-dir verification-output/scion-codex-fresh-b-a-working-readiness-gap-v0.16.47 \
  --sealed-output evaluation/scion-adapters/evidence/codex-review-readiness-gap-v0.16.47-b-a.sealed.json \
  --key-output ~/.codex/scion-secrets/CourseMapper/readiness-gap-v0.16.47-b-a.key
```

The command re-verifies every immutable chunk and the tracked receipt, rejects missing or extra working files, validates each completed chunk, requires one identical fresh judge session across all chunks, reconstructs canonical case order in memory, and creates only one AES-256-GCM envelope plus one 0600 key. It never writes the combined completed pass.

Return only the sealed envelope path, a separately transferred key path, and the outcome-sealed validation summary. Do not unseal or ingest either order inside the fresh judge task.
