# CourseMapper Next-Steps Audit — 2026-06-09

Scope: full repo review at v0.8.59 (commit `2dba881`), focused on (1) the blueprint→compiler weight shift for token efficiency, (2) agent abilities, (3) UI/UX, (4) general quality/health. Cross-checked against `docs/WEBSITE_DEEP_AUDIT_2026-06-04.md` to avoid repeating closed items.

## Where the project stands

The architecture is already further along than the stated goal implies. All 9 standard deliverables plus 11 custom families compile deterministically from the blueprint (`BLUEPRINT_COMPILED_FEATURES`, hybrid pipeline audit: 156 baseline calls → 0). The blueprint itself is built **deterministically** from the course map (`buildCourseBlueprint`), with a single capped (~1,800 output tokens) enrichment call. v0.8.4 Phases 0–2 are done; Phases 3–4 have foundations; the semantic contract gates compilation. Test surface (1,700+ unit, 100+ e2e, gold/sweep/red-team gates, 25/25 real-browser agent proof) is exceptional for a project this size.

Consequence: the remaining model token spend is no longer in deliverables. It is, in order:

1. **Course-map generation** — chunked calls with a long system prompt + ~10 verbose column definitions, and verbose prose JSON output per cell. This is now the dominant spend.
2. **Examine/QA patch pass** over the whole course map.
3. **Repair/retry reserve** (model calls per feature on weak spots).
4. **Agent loop** — static prompt ~11 KB (~2.7k tokens) × up to 20 iterations, plus tool results and history.
5. Enrichment call, unknown custom deliverables, image generation.

## A. Blueprint → compiler: the highest-leverage moves

### A1. Make the course map itself a compiled view (the big one)

Today the model writes instructor-facing prose directly into course-map cells ("Students will be able to:" stems, numbered activity sentences, QM phrasing), then `buildCourseBlueprint` re-extracts atoms from that prose. Invert it: have the model emit **lean lesson/assessment atoms** (terse objective verb-phrases, assessment anchors, resource citations, activity patterns, confidence/anchors) — essentially the `BlueprintSemanticContract` shape — and let the compiler render the course-map table prose, exactly as it already renders syllabi and lesson plans.

- Estimated effect: 40–60% fewer output tokens on the dominant call family, and cheaper examine/repair passes because patches target atoms, not paragraphs.
- Quality risk is low _if_ gated the same way deliverables were: run the 34-course sweep + 40-sample gold audit as an A/B no-regression gate before switching the default.
- This also completes the v0.8.4 north star: model = source interpretation only; compiler = all rendering.

### A2. Prompt caching on generation calls (quick win)

`agentProviders.js` sets Anthropic `cache_control` correctly, but the generation path (`modelRequestBuilders.js` / provider builders) does not. The course-map system prompt + column definitions are identical across every chunk and retry — cache them. For OpenAI, keep the static prefix byte-stable so automatic prefix caching applies. Near-zero risk, immediate input-token savings on every multi-chunk generation.

### A3. Deterministic-first examine pass

The examine pass sends the full course map for model review. Most of its checklist (missing cells, numbering, consistency, vague fields) is already checkable by `validateCourseMap`/`pedagogicalValidator`. Run deterministic checks first; call the model only with the failing lessons/cells (or skip entirely when clean). Aligns with Phase 5's repair-before-model rule.

### A4. Finish v0.8.4 Phases 5–7

- **Phase 5 (deterministic repair library):** highest cost ROI of the remaining phases — repair-retry reserve currently budgets up to ~3–4 model calls per feature; most listed repairs (scoring math, coverage gaps, placeholders, stale titles) are deterministic.
- **Phase 6 (stale regeneration):** also an agent win — a lesson-title edit cascading through compiled deliverables with zero provider calls makes the agent feel instant and free.
- **Phase 3 remainder:** source-exact assessment policy.
- **Phase 7:** migrate audits to judge the split (blueprint size / derived-output ratio matrix) so the leaner blueprint doesn't get penalized by legacy maturity checks.

### A5. Guard the known failure mode: templated sameness

Your own sweeps repeatedly caught compiler boilerplate (repeated distractors, checklist sentences, "AI pedagogy" bleed). Every move from model→compiler increases this risk. Two guards:

- Promote the repeated-copy / lesson-specificity checks from sweep scripts into a first-class **variety metric** in `audit:gold` with a threshold, so it gates every weight-shift PR.
- Keep enrichment atoms (signature terms, lesson phrases, teaching moves) as the designated variety source; consider routing the enrichment call to the cheapest capable model rather than cutting it — it's already capped and is what keeps compiled output from sounding templated.

## B. Agent abilities

- **Route more reads locally.** v0.8.59 keeps count/list questions local; extend the local router to coverage/readiness/status questions that `inspect_workspace` can answer deterministically, and to Phase 6 stale-regeneration edits. Goal: a typical "rename + cascade + verify" loop costs one model call or zero, not 3–5 iterations.
- **Cheap-first model routing.** ROADMAP v0.7 item 7 (cost-efficient models first, escalate on failed quality passes) — `agentModelRouting.js` exists; verify escalation is actually exercised and add a routed-vs-escalated counter to receipts/usage cost so you can see the savings.
- **History compaction.** With 20 iterations and parallel tool calls, mid-conversation token growth is the agent's real cost driver. Summarize/truncate old tool results (keep receipts, drop raw payloads) past N turns.
- **Capability roadmap (in order of product value):** institution-profile knobs applied at compile time (v0.8.4 item 5 — preferences as compiler knobs, not prompt text); Canvas/LMS-structured package export (v0.8 item 4 — biggest credibility jump for real pilots); citation-grounded readings via the existing 6-source academic search (v0.8 item 3).

## C. UI/UX

Closed since the 06-04 audit (verified): sticky CTAs on FeatureSelect/Config, CSP headers in `firebase.json`, secret-value regex redaction in snapshot/message sanitizers.

Still open, in priority order:

1. **Trust surface in the product** (was P2, should be P1 given your positioning). The compiler tracks compiled vs model-generated, repairs, assumptions, review-required lessons — but users only see this in receipts/audit files. A compact package-level trust strip (e.g. "9 compiled · 3 repairs · 2 lessons need source review") in the workspace header and export panel is the single most differentiating UI move available; no competitor can show it.
2. **Prompt-aware config preview.** `Config.jsx` still selects from static `PREVIEW_EXAMPLES`; the 06-04 audit's trust break (Spanish-healthcare prompt → ML preview, wrong lesson count) appears unresolved. Either derive the preview from detected lessons/topic, or visually quarantine it as "example, not your course."
3. **Config screen density.** 2,176 lines rendering model defaults, scope, institution profile, preview, column layout, advanced options, and per-deliverable settings before Generate. Default to recommended settings + progressive disclosure; treat the expert controls as a drawer.
4. **First-paint blank flash** on landing (~1s) — preload/skeleton.
5. **Local-data control:** an explicit "clear local keys & course data" action plus precise key-storage copy (obfuscated localStorage, not encryption).

## D. Code health & security

- **Split `courseBlueprintCompiler.js` (15,471 lines).** It already has natural seams (per-deliverable `compile*`, contracts, proof bundle, custom families). One file this size slows every tool, review, and merge — and it is your highest-churn file. Same treatment later for `AppFlow.jsx` (4.3k), `deliverablePostProcess.js` (4.1k), `useDeliverables.js` (3.8k), `ChatPanel.jsx` (2.8k).
- **`server.js`:** still a dormant permissive-CORS Express proxy in the deployable repo root. Remove to an `archive/` or separate repo; its presence is pure liability.
- **Dependency hygiene:** dev-audit findings (1 high) from 06-04 likely still pending; keep React 19 / Tailwind 4 / pdfjs 6 as deliberate tracks.
- **External proof packet** remains the blocker for any "externally proven quality" claim — still `internal-provisional-only`. One real external course-map fixture at 5/8/14 lessons unblocks it.
- Secrets posture is fine: `.env` / `API-dontComit/` gitignored and untracked; Firestore rules ownership-scoped with field-count guard.

## Suggested order

1. A2 prompt caching + A3 deterministic-first examine (days, pure savings, no quality risk).
2. A5 variety metric gate (prerequisite for everything below).
3. A1 lean course-map atoms behind a flag, A/B'd through sweep + gold gates.
4. Phase 5 repair library, then Phase 6 stale regeneration (also the agent win).
5. C1 trust strip + C2 preview fix + C3 config disclosure (one UX release).
6. Compiler file split + `server.js` removal + dep pass (housekeeping release).
7. External proof fixture collection in parallel throughout.
