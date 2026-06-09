# Agent Redesign Vision — The TA Who Built the Course

## Why a ground-up redesign

The agent works. It routes, edits safely, finalizes packages, passes a 25-scenario browser harness with a 100/100 response-quality average. And it still feels useless and dull, because everything it is optimized for is _operations_, and nothing it is optimized for is _the course_.

The instructor's complaint, precisely stated: the agent does not feel connected to the output. It cannot quote the materials. It has no opinions about them. It never notices anything. It edits through surgical paths instead of writing like an author. It answers like a terminal, not like a colleague who knows the course inside out.

The irony is that this agent has the best possible claim to knowing the course inside out: **the same codebase compiled every artifact.** The blueprint compiler recorded its sources, decisions, repairs, and rationale into the data the agent can already reach — and the agent never reads any of it. This redesign is mostly about letting the agent use knowledge the system already has.

## Audit: why it feels dull (June 2026)

Findings against the current implementation (`agentPrompts.js`, `agentTools.js`, `useChatRouter.js`, `ChatPanel.jsx`):

1. **Context-starved by design.** The system prompt carries lesson titles, item counts, and the active tab's abbreviated schema. The prompt explicitly instructs: answer from this metadata when possible. The agent knows the table of contents, never the book.
2. **A 3KB keyhole onto the course.** `read_deliverable` for one lesson returns abbreviated-key JSON (`{t, ov, ob, ins}`) with a ~3,000-character truncation note (which, as a bonus bug, sets `truncated: true` without actually truncating). Whole-feature reads return counts only. A v0.8.61 quiz lesson does not fit through this keyhole.
3. **It reads JSON; the instructor reads documents.** The agent has never seen the rendered Word/PPT text that v0.8.61 worked so hard to polish. It cannot quote what the user is looking at, so its judgments feel secondhand — because they are.
4. **The persona is a terminal.** One persona sentence ("You are the user's agentic teaching assistant"), then tone rules that ban first person, ban "Let me…", cap replies at 3–8 bullets, cap proposal titles at 5 words. The agent is structurally forbidden from thinking out loud, having taste, or teaching. Obedient ops console ⇒ "dull."
5. **Zero initiative.** The only proactive path is the `[AUTO-REVIEW]` string trigger. No post-generation digest, no "Lesson 5's quiz is all Remember-level," no follow-through on open threads.
6. **Ops tools outnumber pedagogy tools 8-to-0.** Of 25 tools, eight are finalize/verify/repair plumbing. There is no critique tool, no student-lens simulation, no alignment walk, no content search ("where do I introduce recursion?"), no draft-variations workflow.
7. **Path surgery instead of authorship.** `editItem` with `["quizzes",0,"qs",1,"q"]` is excellent for typos and unusable for "rework this overview to sound like me." The agent never holds a full artifact, so it cannot rewrite one with confidence.
8. **Model routing is decorative.** `getModelRoutingAdvice` is advice-only, reachable from one tool, never applied to agent loop calls. Judgment-heavy asks run on whatever mini model is configured.
9. **Chat is a sidecar, not a layer.** Beyond the right-click menu's four canned verbs, the agent does not know what is on screen, cannot navigate the user to what it is discussing, and edits do not pull the view to the diff.
10. **Memory stores settings, not a relationship.** Categories like `teaching_style` hold preference strings. There is no per-course record of decisions made and why — the thing a real TA accumulates.

## North star

> **The agent is the TA who built the course materials — because it did.** It speaks from inside the artifacts: quotes them, critiques them, rewrites them like an author, and explains the design decisions it (the compiler) actually made. It is powerful on request and restrained by default: it observes and proposes freely, and applies judgment only when the instructor says yes.

"Powerful but not leading" becomes a structural contract, not a tone preference:

| Tier        | What                                           | Policy                                                                             |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Observe** | Notice, quote, explain, critique, walk through | Always allowed, unprompted                                                         |
| **Propose** | Drafts, rewrites, restructures, additions      | Default for anything requiring judgment; rendered as reviewable diffs/options      |
| **Apply**   | Mutations                                      | Only for explicit, targeted requests or accepted proposals; receipts + undo always |

## Pillar 1 — An agent that has actually read the course

**Course Content Index.** At generation and after every edit, build a deterministic local index of every artifact's _rendered text_ (same renderers the exports use), chunked per item with stable anchors (`featureId/lesson/item`). Cheap, offline, no provider calls — the same move v0.8.61 made for verification, applied to agent knowledge.

**New context model.** Replace "titles + counts" with:

- a **course brief** (~1.5K tokens): identity, arc, throughline case, assessment architecture, key compiler decisions, open instructor threads;
- the **active artifact's full rendered text** (what the user is looking at right now);
- **retrieval** over the index for everything else.

**New tools.**

- `read_rendered(featureId, lesson?)` — exactly what the instructor sees, untruncated, with anchors.
- `search_course(query)` — anchored hits across all artifacts and the course map. Makes "where do I introduce X?", "do I ever define Y?", "which lessons mention the Riverton case?" one tool call.
- `explain_design(anchor)` — answers "why is it this way?" from the compiler's own records (`blueprintGrounding`, decision matrices, repair ledger, provenance) that already exist on every compiled artifact and are currently read by no one. This is the single highest-leverage unlock: the receipts for "knows this stuff inside out" are already stored.

## Pillar 2 — Author-grade editing

- **`rewrite_item(anchor, instructions)`** — the agent receives the full item text, returns a full replacement, and the UI shows it in the existing `DiffReviewCard`. Path-level `editItem` remains for surgery; authorship becomes the default for prose-level requests.
- **Changesets.** "Make Week 3 case-based" produces one coordinated, reviewable changeset across lesson plan, slides, assignment, and rubric — building on the existing cascade machinery (`CascadePreview`) instead of one-edit-at-a-time chat turns. Accept all, accept per-artifact, or reject.
- **Voice profile.** The accept/reject/edit signals the chat already tracks feed a per-instructor style profile ("shorter sentences, no scare quotes, examples before definitions") that rewrites apply silently — the compiler knobs the previous roadmap called "memory that compiles."

## Pillar 3 — A TA's eyes: proactive, pedagogical, restrained

- **Post-generation digest.** After a package lands, the agent reads the same deterministic signals the trust strip computes (v0.8.61 `contentQualityChecks`, rendered-text audit, readiness gates) plus pedagogy heuristics (Bloom's distribution, objective→assessment coverage, workload spikes) and surfaces **at most three observations** as quiet chips. Each chip = observation → why it matters → 1–2 options → ignore. Nothing is ever auto-applied. This finally connects the trust surface to a voice that can explain it.
- **Student lens.** `simulate_student(anchor)` — "Here is where a student stalls on this brief: step 4 assumes they know what a stakeholder map is; the rubric never mentions it." The TA's most useful instinct, as a tool.
- **Alignment walk.** `trace_objective(objective)` — follow one objective through quiz items, rubric criteria, slides, and activities, with quoted anchors, and say where the chain breaks.
- **Open threads.** When the instructor defers something ("I'll fix rubric weights later"), the agent records it in the course journal and resurfaces it at the right moment ("Before export: you wanted to revisit rubric weights").

## Pillar 4 — Shared focus between chat and canvas

- The agent's context includes viewport state: open artifact, visible item, current selection. "This question is too easy" needs no disambiguation.
- Agent replies carry **anchors**: clicking one navigates the workspace to that item and highlights it. After an applied edit, the view scrolls to the diff.
- The right-click menu graduates from four canned verbs to index-aware actions ("This objective is never assessed — add a quiz item?").

## Pillar 5 — A voice worth listening to

Rewrite the persona and tone contract:

- A named role — the course TA — with first person allowed, opinions allowed _and labeled as opinions_, questions asked sparingly but genuinely.
- Conversation-length calibration: one good sentence for small things; a real walkthrough when asked to think. Kill the universal 3–8-bullet cap; keep the no-walls instinct.
- Keep, verbatim: no fabrication, no invented citations or sources, confirmation before broad/destructive mutations, receipts, undo. Restraint is part of the character — the TA does not grab the wheel.
- **Apply model routing for real:** reads and routing on the cheap model; authorship, critique, and the digest on the configured strong model; escalation wired to the existing response-quality scorecard, recorded in receipts.

## Pillar 6 — Memory of the working relationship

A per-course **decision journal**, agent-written and user-visible: design decisions and rationale ("week 3 went case-based because the cohort is practitioners"), instructor taste observed from edits, open threads. It feeds the course brief, so every conversation starts already knowing the story so far. Global preferences (`agentMemory.js`) remain for cross-course taste.

## What gets deleted or demoted

- The "answer from metadata, don't read" rule — inverted: ground claims in quoted content.
- The 3KB read keyhole and count-only summaries (`read_deliverable` becomes the structured sibling of `read_rendered`).
- Five of the eight package-plumbing tools fold into one `finish_package` orchestrator with internal stages; the agent's tool list should read like a TA's skills, not a CI pipeline.
- The blanket first-person ban and the 5-word proposal-title cap.

## Staged delivery

**v0.9.0 — "It has read the course."** Content index + `read_rendered` + `search_course` + `explain_design`; context rebuild (course brief + active artifact + retrieval); persona rewrite; model routing applied to loop calls. _Exit test: the agent quotes any artifact verbatim on request; "where do I introduce X?" resolves with anchors; "why is this quiz like this?" answers from compiler records._

**v0.9.1 — "It writes like an author."** `rewrite_item`, multi-artifact changesets with diff review, voice profile from edit signals. _Exit test: "make this overview sound like me" round-trips through a diff card and the result survives the v0.8.61 content-quality gates._

**v0.9.2 — "It has a TA's eyes."** Post-generation digest chips, student lens, alignment walk, shared focus + anchor navigation, decision journal. _Exit test: new browser-harness scenarios assert (a) the digest fires with ≤3 grounded observations, (b) the agent never applies an unrequested judgment change across the full red-team suite._

Every stage extends the existing real-browser harness and response-quality scoring; the non-leading contract becomes a permanent red-team gate.

## Definition of "not dull anymore"

Ask the rebuilt agent "what do you think of Lesson 4?" It opens with a quoted line from the actual assignment brief, says what works, names one specific weakness with the student-lens reason, offers two concrete rewrites as a diff — and waits.
