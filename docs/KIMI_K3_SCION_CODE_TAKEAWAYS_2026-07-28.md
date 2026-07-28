# Kimi K3 code review: concrete takeaways for Scion

**Review date:** 2026-07-28

**Scion revision reviewed:** `6d4b3880eb01206354441bc94a00b3c2ddc22d5f`

**Decision:** Learn from K3's agent protocol, task harness, verification, and deployment discipline. Do **not** use K3 as Scion's browser model or copy its model architecture into the current Gemma-based runtime.

## Executive conclusion

The biggest lesson from Kimi K3 is not “make Scion a larger model.” It is “make the small Scion model operate inside a better protocol.”

Scion should take five near-term ideas:

1. Add a strict, provider-neutral action envelope for browser-local tool use.
2. Reveal tools progressively instead of sending the full 31-tool catalog to the model.
3. Canonicalize tool schemas, arguments, call IDs, and result ordering.
4. Replace destructive chat-history trimming with a compact, course-aware state handoff.
5. Build a replayable Scion task gym whose reward is the verified final workspace state.

Scion should also reuse what CourseMapper already does well: schema-constrained output, source grounding, mutation confirmation, read-back verification, receipts, and undo. K3 validates those design choices; it does not justify rebuilding them.

The model-architecture pieces—KDA, AttnRes, 896-expert LatentMoE, the 401M-parameter vision tower, and a one-million-token context—are not practical additions to the current browser-local Scion. The released Hugging Face package occupies about **1.561 TB** across 96 weight shards, about **466×** Scion's 3.350 GB browser GGUF. More importantly, the released MoE implementation is inference-only: its gate asserts that the module is not training, and the sparse MoE block raises `NotImplementedError` in training mode.

## What was actually reviewed

This review separates executable code from model-card claims and report-only training descriptions.

| Evidence                                                                                                                       | Pinned revision                            | What it establishes                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Kimi K3 Hugging Face implementation](https://huggingface.co/moonshotai/Kimi-K3/tree/9f62e4e9fffbd0a83ddd60e1c209d828994b3569) | `9f62e4e9fffbd0a83ddd60e1c209d828994b3569` | Real config, tokenizer/XTML protocol, processor, vision merge, KDA cache and kernels, MoE routing, AttnRes, and quantization metadata                                              |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code/tree/425cfdf53f0fd3b01527f5fba87acff68f49f368)                             | `425cfdf53f0fd3b01527f5fba87acff68f49f368` | Real agent-harness code for progressive tool disclosure, context compaction, permissions, event-sourced state, and undo                                                            |
| [AgentENV](https://github.com/kvcache-ai/AgentENV/tree/6296bc4be7ad79eb3a278eb5264ef011c341adf5)                               | `6296bc4be7ad79eb3a278eb5264ef011c341adf5` | Real snapshot and isolated-environment implementation used as supporting agent infrastructure                                                                                      |
| [K3 technical report](https://github.com/MoonshotAI/Kimi-K3/blob/0797decb18ab079de86f991b87a64b81ec15a3c2/k3_tech_report.pdf)  | `0797decb18ab079de86f991b87a64b81ec15a3c2` | Descriptions of post-training, task synthesis, harness diversity, final-state verification, token-budget training, QAT, and infrastructure; not a released training implementation |
| Current CourseMapper/Scion code                                                                                                | `6d4b3880eb01206354441bc94a00b3c2ddc22d5f` | The product gaps and existing controls to which the K3 ideas are mapped                                                                                                            |

The Hugging Face revision had 118 files, 96 `.safetensors` shards, and 1,561,018,243,668 bytes of storage when checked. The code and weights use the Kimi K3 License. Kimi Code and AgentENV are MIT-licensed. Any direct code reuse must retain the applicable notices; the recommendations below mostly reimplement small concepts in CourseMapper's own abstractions.

## What the released K3 code really contains

### 1. A typed interaction protocol, not just a prompt

K3's Python encoder separates structural control tokens from ordinary user/tool text. It normalizes tool arguments, canonicalizes nested dictionaries, renders response-schema options, and assigns separate structural channels to response content and tool calls:

- [control tokens and ordinary-text separation](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/encoding_k3.py#L1-L109);
- [response-schema extraction, deep sorting, and argument normalization](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/encoding_k3.py#L157-L207);
- [tool-result matching and reordering by opaque call ID](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/encoding_k3.py#L293-L372);
- [separate think, response, and tool-call structures](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/encoding_k3.py#L409-L459); and
- [normalization before rendering plus response-schema and effort options](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/encoding_k3.py#L489-L535).

The transferable idea is the typed boundary. The XTML syntax and K3 special tokens are model-specific and should not be copied into Gemma.

### 2. Progressive tool disclosure

Kimi Code treats full tool schemas as protocol context rather than ordinary conversation. Its history is the loaded-tool ledger, allowing undo, compaction, and resume to reconstruct the active tool set:

- [dynamic-tool context and history-derived ledger](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/toolSelect/dynamicTools.ts#L1-L28);
- [the `select_tools` instruction](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/toolSelect/dynamicTools.ts#L114-L130); and
- [capability gating, schema loading, unknown-name handling, and sorted disclosure](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/toolSelect/toolSelectService.ts#L95-L172).

This is especially relevant to Scion because a small local model is more easily confused by a large tool catalog than K3 is.

### 3. Structured context lifecycle

Kimi Code records append, loop, compaction, and undo operations as deterministic state transformations. Large blobs can be dehydrated and later rehydrated; data removed by compaction is not reloaded:

- [event-sourced context and blob lifecycle](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/contextMemory/contextOps.ts#L1-L38);
- [append, clear, compaction, and undo operation definitions](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/contextMemory/contextOps.ts#L113-L199); and
- [head/tail preservation under a token budget](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/contextMemory/compactionHandoff.ts#L195-L256).

Its compaction prompt explicitly requires a self-sufficient handoff that preserves the active request, constraints, completed work, unknowns, exact paths, and forward plan. That is a much safer pattern than silently deleting low-scored messages.

### 4. Ordered permission policies and coordinated undo

Kimi Code evaluates tool risk through a first-match ordered policy chain that includes explicit deny/ask/allow rules, session approval history, sensitive paths, intrinsic tool defaults, and a fallback ask:

- [ordered permission chain](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/permissionPolicy/permissionPolicyService.ts#L34-L70).

Undo is only allowed while the loop and compactor are quiescent. It cuts context, flushes the committed state, reconciles every registered participant, and emits telemetry:

- [undo availability and quiescence](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/undo/undoService.ts#L75-L121);
- [checkpoint-boundary validation](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/undo/undoService.ts#L124-L181); and
- [participant reconciliation](https://github.com/MoonshotAI/kimi-code/blob/425cfdf53f0fd3b01527f5fba87acff68f49f368/packages/agent-core-v2/src/agent/undo/undoService.ts#L184-L213).

CourseMapper already has most of this product behavior. Scion should route its future local tool calls through the existing controls, not create a weaker local-only path.

### 5. Hybrid model states and selective precision

The K3 model code keeps different cache states for different layer types: convolution and recurrent state for KDA layers, key/value state for full-attention layers:

- [hybrid dynamic cache](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_linear.py#L120-L223).

KDA selects a chunk kernel for prompt processing and a fused recurrent kernel for one-token cached decoding:

- [KDA execution-mode selection and state update](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_linear.py#L543-L663).

The configuration quantizes routed expert weights in MXFP4 groups while excluding attention, shared experts, dense MLPs, the language-model head, vision tower, and projector from that rule:

- [quantization configuration and exclusions](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/config.json#L202-L244).

The transferable principle is “state-aware caching and sensitivity-aware precision,” not “port KDA into WebGPU.”

### 6. Strict multimodal slot accounting

K3's processor checks that media placeholders and generated image prompts match exactly. The model separately verifies that the number of image-token positions equals the number of image features:

- [processor placeholder-count checks](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/kimi_k3_processor.py#L54-L97); and
- [model-level image-token/feature check](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_k3.py#L1059-L1079).

This is a useful pattern for future Scion screenshot critique: every visual observation should be tied to an explicit artifact ID, page/slide number, dimensions, and placeholder.

### 7. The architecture release is not the training release

The config proves the model shape: 93 layers, 1,048,576-token maximum position, 896 routed experts, 16 experts per token, and two shared experts:

- [K3 text configuration](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/config.json#L20-L201).

But the executable MoE code is intentionally not a K3 training stack:

- [`assert not self.training` in the router](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_linear.py#L703-L759); and
- [`NotImplementedError` in the sparse MoE training path](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_linear.py#L809-L838).

The technical report describes the training recipe, but the complete pretraining, RL, teacher-distillation, data-generation, and distributed-training implementation is not in the Hugging Face package.

## Current Scion baseline

The recommendations below start from what Scion already is.

- Browser-local Scion loads a pinned Gemma 4 GGUF and relies on the compiler for validation and expansion ([`publicScionProvider.js`](../src/lib/publicScionProvider.js#L1-L20)).
- Its browser-local capability profile explicitly says `toolCalling: false` ([`publicScionProvider.js`](../src/lib/publicScionProvider.js#L280-L295)).
- In agent mode it is deliberately advisory and must not claim to have changed the workspace ([`publicScionProvider.js`](../src/lib/publicScionProvider.js#L602-L628)).
- The local server route also declares no tool-calling surface, although it does enforce JSON Schema with llguidance ([`localProvider.js`](../src/lib/localProvider.js#L35-L52)).
- Scion already has strong, locked JSON Schema contracts ([`scionContracts.js`](../src/lib/scionContracts.js#L22-L36), [`scionContracts.js`](../src/lib/scionContracts.js#L125-L180)).
- The paid-provider agent has 31 registered tools ([`agentTools.js`](../src/lib/agentTools.js#L998-L2837)), and the current loop turns the full execution-mode-filtered registry into provider tools on each run ([`useToolInvoker.js`](../src/components/chat/useToolInvoker.js#L1902-L1907)).
- The agent already blocks unknown tools, dry-run mutations, confirmation-policy violations, and serious unplanned mutations ([`useToolInvoker.js`](../src/components/chat/useToolInvoker.js#L2118-L2233)).
- The agent already retries transient tool failures and records honest partial/error outcomes ([`useToolInvoker.js`](../src/components/chat/useToolInvoker.js#L2242-L2280)).
- Current context pressure is handled by scoring and deleting chat messages, not by creating a semantic handoff ([`useToolInvoker.js`](../src/components/chat/useToolInvoker.js#L1857-L1890)).
- The measured downstream quality ceiling remains the deterministic compiler: the July 24 assessment found 91% repeated prose and identified the compiler, not the model, as the bottleneck ([`SCION_ASSESSMENT_2026-07-24.md`](./SCION_ASSESSMENT_2026-07-24.md#L155-L176)).

## Prioritized adoption list

| Priority | K3-derived idea                       | Scion action                                                                                                  | Classification   | Why now                                                                              |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| P0       | Typed response/tool protocol          | Add a strict Scion action envelope and parser; enable read-only local tools first                             | **Build**        | It is the missing boundary between advisory local chat and safe local agency         |
| P0       | Progressive tool disclosure           | Start with 5–6 core tools and load exact additional schemas on demand                                         | **Build**        | The full 31-tool catalog is excessive for a small browser model                      |
| P0       | Canonical tool ledger                 | Normalize schemas/arguments, bind results to opaque IDs, restore call order, reject unresolved IDs            | **Build**        | It prevents ambiguous or misattributed tool execution                                |
| P0       | Course-aware compaction               | Replace message deletion with a typed workspace handoff plus a short recent tail                              | **Build**        | Current trimming can silently erase decisions, source bindings, or failed operations |
| P0       | Existing permission/verification path | Route local actions through the same confirmation, planning, receipt, read-back, and undo code                | **Reuse**        | CourseMapper already has stronger domain controls than a new local path would        |
| P1       | Verified task environment             | Build a deterministic Scion Workspace Gym with initial snapshot, objective, budgets, and final-state verifier | **Build**        | It creates usable evaluation data and a future training lane                         |
| P1       | Effort and token budgets              | Give each task class a bounded calls/tokens/tools budget and report overruns                                  | **Build**        | A small local model needs efficiency discipline more than “max reasoning”            |
| P1       | Multimodal slot contracts             | Add typed screenshot evidence packets for slide/export critique                                               | **Experiment**   | Valuable for visible quality, but current Scion is text-first                        |
| P2       | Sensitivity-aware quantization        | Add mixed-precision criteria to the next base/runtime bake-off                                                | **Study**        | It cannot retrofit the current pinned Gemma GGUF                                     |
| Reject   | K3 weights as Scion base              | Keep Gemma browser base and separate adapter/compiler architecture                                            | **Do not use**   | K3 is roughly 1.56 TB and operationally incompatible with Scion's product promise    |
| Reject   | KDA/AttnRes/LatentMoE port            | Treat as future base-model research only                                                                      | **Do not build** | It requires a different model, CUDA/Triton-style kernels, and training stack         |
| Reject   | Raw preserved reasoning history       | Store observable actions and summaries, never hidden reasoning traces                                         | **Do not copy**  | It is model-specific, costly, and undesirable for privacy and product truth          |

## Detailed Scion changes

### P0.1 — Introduce `ScionActionEnvelope`

Create a provider-neutral action contract rather than teaching Gemma K3's XTML:

```json
{
  "version": 1,
  "kind": "tool_calls",
  "calls": [
    {
      "id": "call_7f3a",
      "tool": "read_lesson",
      "arguments": { "lessonIndex": 2 }
    }
  ]
}
```

The terminal response uses a disjoint shape:

```json
{
  "version": 1,
  "kind": "response",
  "message": "Lesson 3 has two objectives that are not assessed."
}
```

Implementation:

- add `src/lib/scionAgentProtocol.js`;
- declare the contract through the existing strict-schema helpers;
- reject additional properties, missing/duplicate IDs, unknown tools, non-object arguments, mixed response/tool payloads, and oversized argument strings;
- canonicalize object keys before hashing, caching, logging, or comparison;
- never accept or persist a `reasoning`, `thinking`, or `reasoning_content` field;
- use decode-time JSON Schema on the local server route;
- use bounded parse/repair plus one schema-specific retry in the browser route until its runtime supports grammar-constrained agent output; and
- add `src/lib/__tests__/scionAgentProtocol.test.js`.

Rollout sequence:

1. response-only envelope;
2. read-only tools;
3. proposal generation;
4. narrow, reversible mutations through existing confirmation and undo;
5. broader mutations only after the frozen agent suite passes.

Do not change `toolCalling` to `true` until stages 1–2 meet the acceptance tests below.

### P0.2 — Add progressive tool disclosure

The initial local catalog should be deliberately small:

- `respond`;
- `inspect_workspace`;
- `read_lesson`;
- `read_deliverable`;
- `search_course`; and
- `select_tools`.

`select_tools` accepts exact names from a compact, categorized catalog. Only selected full schemas are added to subsequent turns. Mutating tools are never loadable in suggest-only mode.

Recommended implementation:

- add disclosure metadata to `AGENT_TOOLS`: `always`, `deferred`, or `disabledForLocal`;
- add a compact catalog containing name, one-sentence purpose, risk class, and required capability;
- deterministically preselect obvious domain tools from the user's intent before invoking the model;
- let `select_tools` cover ambiguous cases;
- sort tool names and schemas before rendering;
- reconstruct the loaded set from the observable conversation/action ledger, rather than a second unsynchronized store;
- after compaction or undo, recompute the loaded set from the surviving ledger;
- if a selected tool becomes unavailable, return a precise unavailable result and do not invite immediate blind retries; and
- never expose mutation tools until local action-protocol conformance is proven.

Target files:

- `src/lib/agentTools.js`;
- new `src/lib/scionToolDisclosure.js`;
- `src/components/chat/useToolInvoker.js`; and
- focused tests under `src/lib/__tests__/` and `src/components/chat/__tests__/`.

This change also benefits paid providers by reducing prompt size and tool-selection confusion.

### P0.3 — Make tool calls and results a canonical ledger

Scion already carries `toolCallId` in results, but the protocol should make the invariant explicit:

```text
assistant call ID
  -> exactly one normalized tool name and argument object
  -> exactly one result with the same ID
  -> result restored to assistant call order
  -> observable receipt
```

Rules:

- IDs are opaque; never derive meaning from an ID format.
- Duplicate call IDs fail the whole batch before execution.
- A result with no matching call ID fails closed; unlike K3's compatibility behavior, Scion should not leave unresolved runs in ambiguous order.
- The matched call is authoritative for the tool name.
- Parallel read-only calls are allowed.
- Mutations that can overlap the same course/deliverable target are serialized unless the planner proves disjoint targets.
- Unknown tools return a bounded error, not the entire 31-name catalog.
- Tool result content is size-capped and stored separately from the compact conversation summary.
- Every mutation result includes the pre-state digest, post-state digest, changed targets, verifier status, and undo checkpoint ID.

This is a hard safety boundary, not a prompt convention.

### P0.4 — Replace message deletion with `ScionContextHandoff`

The current agent keeps recent and user/source-context messages by score, then deletes the rest. The Kimi Code pattern suggests a better Scion-specific shape:

```json
{
  "goal": "...",
  "constraints": ["..."],
  "course": {
    "courseMapDigest": "...",
    "sourcePacketDigest": "...",
    "activeLessonIds": ["L03"]
  },
  "decisions": [{ "id": "decision_12", "summary": "...", "userConfirmed": true }],
  "completedActions": [
    {
      "toolCallId": "call_7f3a",
      "tool": "edit_course_map",
      "targets": ["L03.objectives"],
      "postStateDigest": "...",
      "verified": true
    }
  ],
  "openIssues": ["..."],
  "failedActions": ["..."],
  "nextStep": "...",
  "loadedTools": ["read_lesson", "edit_course_map"]
}
```

Implementation rules:

- build the handoff from observable state and receipts, not model reasoning;
- preserve exact course, lesson, assessment, source, and deliverable IDs;
- preserve the user's latest request verbatim within a bounded limit;
- retain a short head for original intent and a short recent tail;
- keep large source text and images by digest/reference rather than embedding them repeatedly;
- validate all referenced IDs against the current workspace before reuse;
- invalidate stale handoffs when the course/source digest changes;
- count tokens before and after compaction and surface the reduction in telemetry; and
- make compaction and undo mutually exclusive.

Target files:

- new `src/lib/scionAgentMemory.js`;
- `src/components/chat/useToolInvoker.js`;
- the existing receipt builders in `useToolInvoker.js`; and
- `src/components/chat/__tests__/useToolInvoker.compaction.test.js`.

### P0.5 — Reuse CourseMapper's safeguards for local Scion

Do not build a second local agent executor. Adapt the local action envelope into the existing loop so it inherits:

- suggest-only blocking;
- mutation confirmation;
- plan-before-serious-mutation enforcement;
- transient retry limits;
- loop detection;
- honest partial/error classification;
- state diffs and receipts;
- read-back verification; and
- undo.

The code at [`useToolInvoker.js`](../src/components/chat/useToolInvoker.js#L2118-L2280) is already the correct enforcement point. The local model should be merely another producer of normalized calls.

Local rollout should begin with the existing read-only tools. Mutation enablement is a capability flag earned by evaluation, not a model-name assumption.

### P1.1 — Build a Scion Workspace Gym

The K3 report's most valuable training lesson is that agent tasks should be judged by the final environment state rather than the agent's claim of completion. AgentENV demonstrates snapshot metadata that captures source, command context, resources, and runtime versions:

- [snapshot publish metadata](https://github.com/kvcache-ai/AgentENV/blob/6296bc4be7ad79eb3a278eb5264ef011c341adf5/src/snapshot/types/snapshot.rs#L20-L69); and
- [snapshot context](https://github.com/kvcache-ai/AgentENV/blob/6296bc4be7ad79eb3a278eb5264ef011c341adf5/src/snapshot/types/snapshot.rs#L149-L201).

CourseMapper does not need microVMs. A course workspace is JSON and can be cloned cheaply. Each gym case should contain:

```text
case ID
initial course/source/deliverable snapshot + digests
user objective
allowed tools and risk mode
maximum provider calls, tool calls, and output tokens
forbidden actions
independent final-state validators
expected source/citation invariants
optional visible-output screenshot checks
```

Start with 25 frozen cases across five families:

1. read and explain;
2. find a grounding or alignment defect;
3. make one narrow course-map edit;
4. propagate and verify a deliverable edit;
5. recover from a partial tool failure.

Run the same cases through:

- current paid-provider agent;
- browser-local Scion;
- local-server Scion; and
- optional K3 teacher runs on public or synthetic data only.

Never send a user's private syllabus or course workspace to the K3 API. Self-hosting the 1.56 TB release is not a realistic Scion prerequisite. If K3 is used as a teacher, restrict it to synthetic/public fixtures, retain only observable tool calls and final responses, and accept examples only when Scion's independent final-state validators pass.

### P1.2 — Add task-class budgets

K3's report trains different effort levels and penalizes trajectories that exceed per-problem token budgets. Scion should adopt the product-level version:

| Task class            | Default effort | Provider-call cap | Tool-call cap | Policy                                            |
| --------------------- | -------------- | ----------------: | ------------: | ------------------------------------------------- |
| Answer/read           | low            |               1–2 | 0–3 read-only | No mutation                                       |
| Narrow edit           | low            |               2–4 |           1–5 | Plan optional if target is exact; verify required |
| Cross-artifact repair | medium         |               4–8 |          3–12 | Plan, mutate, validate, verify                    |
| Package finish        | medium         |              6–12 |          5–20 | Existing readiness and export gates               |

These are starting budgets, not permanent constants. Record budget overruns and success rates by task family. Browser-local Scion should not default to K3's `max` effort.

### P1.3 — Add typed visual evidence packets

For slide, document, and export review, represent each screenshot as:

```json
{
  "slotId": "slideDecks:L03:slide:5",
  "artifactDigest": "...",
  "width": 1600,
  "height": 900,
  "renderVersion": "...",
  "imageRef": "..."
}
```

The request must fail if slot count, order, or artifact digests do not match the supplied images. This borrows K3's strict media accounting without adopting its vision tower.

Use a separate capable vision evaluator initially. A future multimodal Scion base may consume the same packet, so the product contract survives model changes.

### P2 — Use selective precision as a future bake-off criterion

For the next base or runtime comparison:

- evaluate which modules are precision-sensitive instead of applying one quantization rule globally;
- keep the Scion adapter in higher precision unless measured evidence supports further quantization;
- measure schema adherence, tool-call validity, source grounding, speed, peak memory, and device coverage at every precision profile; and
- require the exact deployed quantized artifact in evaluation.

This is a future-base criterion. It is not a reason to mutate the currently pinned Gemma GGUF or restart the adapter program.

## Post-training lessons from the report—not released code

These ideas come from the technical report. They should not be presented as reusable K3 training code.

### Useful if Scion research resumes

- **SFT before RL.** K3 establishes the agent protocol and cold-start behavior with supervised trajectories before reinforcement learning. Scion should not attempt RL while it lacks a proven local tool protocol and accepted task corpus.
- **Verifier-filtered trajectories.** K3 describes multi-stage verification and human annotation. Scion can do better than generic judging because CourseMapper already has deterministic schemas, validators, source IDs, export checks, and state diffs.
- **Knowledge-graph-guided task synthesis.** The Curriculum Genome can sample concept, discipline, task type, artifact type, and failure pattern to create diverse Scion gym cases.
- **Harness diversity.** Vary tool names/order, prompt wording, context pressure, source-packet length, dry-run/apply mode, and available tool subsets. The model should learn the underlying action contract, not one frozen prompt.
- **Final-state reward.** Score whether the course workspace is correct, grounded, synchronized, and exportable—not whether the model says “done.”
- **Budgeted behavior.** Include calls, output tokens, tool arguments, and unnecessary mutations in the efficiency score.
- **Deployment-aware training.** Evaluate and, if training resumes, train against the exact Gemma QAT parent and the exact deployed adapter/runtime contract already documented by Scion.

### Bounded experiment, not a revived infrastructure program

K3 does not overturn the current Scion assessment. The near-term quality ceiling is still the compiler, and the existing adapter program has not produced an independently qualified production corpus.

If a research lane resumes, keep it deliberately small:

1. finish the local action protocol;
2. freeze 25 gym cases;
3. collect 50–100 verifier-passing observable trajectories across at least five task families;
4. perform one SFT/LoRA experiment under the existing exact-base contract;
5. score it once under a frozen protocol; and
6. stop or expand based on the measured result.

Do not build RL infrastructure, a multi-teacher system, or a new promotion bureaucracy before this experiment produces a positive signal.

## Things not to copy

### Do not make K3 Scion's base

K3's 104B active parameters, 2.8T total parameters, 96 weight shards, custom kernels, and 1.56 TB release are incompatible with a free browser-local model for ordinary instructor laptops.

### Do not port KDA, AttnRes, or LatentMoE into the current runtime

The KDA implementation imports `fla-core` kernels and uses chunk/fused-recurrent paths. AttnRes mixes block residuals with learned softmax weights ([implementation](https://huggingface.co/moonshotai/Kimi-K3/blob/9f62e4e9fffbd0a83ddd60e1c209d828994b3569/modeling_kimi_linear.py#L1075-L1088)). These are base-model architecture choices, not adapter features.

### Do not teach Gemma K3's XTML tokens

K3's special-token protocol is aligned during K3 training. Scion should express the same separation through its existing JSON Schema/llguidance capability and a small adapter-neutral envelope.

### Do not persist hidden reasoning

K3 requires preserved `reasoning_content` because that behavior is part of its training contract. Scion should preserve user intent, tool calls, tool results, decisions, and state digests—not private or unverifiable reasoning traces.

### Do not treat one-million-token context as a substitute for memory design

K3's own model card reports using context compaction in BrowseComp. Scion's constrained local runtime makes semantic compaction more important, not less.

### Do not copy code blindly

One concrete warning is visible in the released encoder: `_VALID_THINKING_EFFORTS` contains `low`, `high`, and `max`, while the rendered instruction says supported values include `medium`. Scion should define one schema source of truth and test every advertised option.

## Implementation sequence

### Phase 1 — Protocol foundation

Estimated scope: 3–5 engineering days.

- Implement `ScionActionEnvelope`.
- Add canonicalization and call/result ledger tests.
- Produce response-only local agent output.
- Add read-only calls behind a disabled-by-default capability flag.

Exit gate:

- 100% schema validity on 200 deterministic parser fixtures;
- 100% rejection of duplicate, unknown, mismatched, or oversized calls;
- no mutation tool can be reached.

### Phase 2 — Progressive tools and existing executor

Estimated scope: 3–5 engineering days.

- Add disclosure metadata and `select_tools`.
- Start with the six-tool core catalog.
- Adapt normalized local calls into `useToolInvoker`.
- Preserve all current execution-mode and confirmation controls.

Exit gate:

- at least 98% valid tool selection/call syntax on the 25-case gym;
- at least 50% reduction in tool-schema prompt tokens versus all-tools mode;
- zero unknown-tool executions;
- zero mutations in suggest-only mode.

### Phase 3 — Context handoff

Estimated scope: 4–7 engineering days.

- Implement `ScionContextHandoff`.
- Add digest/reference handling for source and artifact payloads.
- Recompute dynamic tool state after compaction and undo.
- Add compaction telemetry.

Exit gate:

- 100% retention of active course/source/object IDs in compaction tests;
- 100% retention of unresolved failures and user-confirmed decisions;
- no stale handoff reused after a workspace digest change;
- at least 40% context-token reduction on long-turn fixtures.

### Phase 4 — Verified task gym

Estimated scope: 1–2 weeks.

- Freeze 25 initial-state snapshots and validators.
- Run current paid agent and both Scion local routes.
- Add mutation/read-back/undo adversarial cases.
- Optionally generate K3 trajectories on public/synthetic fixtures.

Exit gate:

- final-state success, grounding, efficiency, and safety reported separately;
- every accepted training trajectory independently replayed and verifier-passing;
- no private user data sent to an external teacher;
- one frozen baseline report before any adapter experiment.

### Phase 5 — Compiler and visual quality

Continue the already-identified compiler work in parallel. The K3 review does not change the evidence that repeated compiler prose is Scion's current visible quality ceiling.

Add screenshot evidence packets only after the protocol and task gym are stable.

## Acceptance scorecard

| Metric                                        |                                      Initial target |
| --------------------------------------------- | --------------------------------------------------: |
| Local action-envelope schema validity         |                                  ≥98% on frozen gym |
| Mismatched/unknown call IDs rejected          |                                                100% |
| Suggest-only mutation prevention              |                                                100% |
| Serious mutation with plan or exact target    |                                                100% |
| Mutation followed by independent read-back    |                                                100% |
| Source/course IDs retained through compaction |                                                100% |
| Tool-schema prompt-token reduction            |                                                ≥50% |
| Long-context handoff token reduction          |                                                ≥40% |
| Final-state task success                      |  Report by task family; no aggregate-only promotion |
| Device memory/startup regression              | No regression outside an explicitly approved budget |
| Private user data sent to optional K3 teacher |                                                   0 |

## Final recommendation

Adopt the K3 ideas in this order:

1. **Protocol:** strict local action envelope.
2. **Selection:** progressive tools.
3. **State:** canonical result ledger and course-aware compaction.
4. **Safety:** reuse the existing CourseMapper executor, receipts, verification, and undo.
5. **Evidence:** frozen workspace gym and final-state scoring.
6. **Research:** optional verifier-filtered K3 teacher trajectories on synthetic/public data.
7. **Later:** visual evidence packets and mixed-precision bake-offs.

The practical K3 lesson for Scion is architectural at the application level: a smaller model can become substantially more capable when tools, memory, verification, budgets, and state transitions are explicit. That is a realistic path to a better Scion without abandoning the browser-local product.
