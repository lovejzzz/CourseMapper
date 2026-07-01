# CourseMapper Pipeline Audit — 2026-07-01

Scope: pipeline health audit at v0.15.44 (commit `f89d80d`), run against a fresh
checkout. Every offline gate was executed; findings are cross-checked against
the v0.15.41–v0.15.44 roadmaps and the last recorded EduTool.dev live audit
(`20260621T020414Z`, deployed v0.15.43).

## Gate results (all green)

| Gate | Command | Result |
| --- | --- | --- |
| Unit suite | `npm test` | 3571 passed, 0 failed (249 files; 162 skipped) |
| Lint | `npm run lint` | clean |
| Bundle budgets | `npm run bundle:check` | pass — 61.7 KiB gzip initial landing JS |
| Constitution | `npm run audit:constitution` | pass (5 fixtures) |
| Release history | `npm run audit:release-history` | pass — v0.15.44, 4 claims verified |
| Hybrid pipeline | `npm run audit:pipeline` | pass — 156→0 provider calls (100% saved), 0 blockers, min quality 9, 0 model-generated features |

The compile pipeline is healthy: all 9 deliverable families compile
deterministically across the 9 release cases and 6 stress cases, with zero
release blockers.

## Findings

### F1. v0.15.44 has no live proof yet (protocol gap)

The release loop for the last ~20 versions is: ship → deploy → fresh
EduTool.dev ZIP audit → next patch scoped from that audit. The last recorded
live audit (`20260621T020414Z`) ran against deployed v0.15.43. v0.15.44
(license-safe source selection) targets exactly the 4 P2 findings from that
audit (`kr1`/`kr3`/`kr5` `open access`, OpenLibrary metadata row) but has not
been proven by a fresh deployed audit. Until that runs, the license work is
unverified against live provider behavior.

### F2. Discipline-anchor source gate covers only genetics (recurrence risk)

`DISCIPLINE_ANCHOR_GATES` in `src/lib/knowledge/sourceFinder.js` contains a
single entry — the genetics/genomics regex added in v0.15.37 after the live
audit caught building-environment/geotechnical Crossref rows (and later a
Wikipedia `Driving under the influence` row) attaching to a genetics package on
broad-word matches. Every other discipline that live audits have exercised
(sociology, environmental justice, AI governance, psychology, astronomy,
microeconomics) has no anchor gate, so the same irrelevant-academic-metadata
failure class is open for any non-genetics course. The v0.15.43 roadmap
explicitly leaves "full semantic atom-level source relevance" out of scope —
this is the largest known-unmitigated defect class in the pipeline.

### F3. Compiled-boilerplate texture is the score ceiling

Live texture has plateaued at 93–94/100 across three dedicated texture passes
(v0.15.24–26) and quality at 97–99/A. The local pipeline audit agrees: all 20
release warnings are the same class — repeated boilerplate across
assignments/discussions/study guides (ai-course-design), quiz bank
(sparse-assessment stress), and lesson plans/quiz bank (messy-import stress).
The audit report's own Next Actions recommend a model-enriched blueprint pass
for lesson-specific phrasing. Per-surface deterministic rewording (the
v0.15.24–26 approach) is hitting diminishing returns; each pass fixes named
sentences and the plateau persists.

### F4. Residual license ambiguity needs curated sources, not more gating

v0.15.44's own carry-forward: remaining ambiguous rows must stay visible until
provider metadata proves a real license or a curated OER source replaces them.
Provider-side selection is now done; the remaining lever is a small curated
license-safe OER registry for common disciplines to swap in when retrieval only
returns ambiguous rows.

### F5. Single-fixture audit loop risks overfitting

Recent live audits repeatedly used one course (Genetics and Society for
v0.15.36–43; before that AI Governance, Sociology). Fixes scoped from a single
fixture have already produced discipline-specific patches (F2). Rotating the
live-audit course per release would surface generalization gaps sooner.

### F6. ROADMAP.md is stale (hygiene)

Newest section in `ROADMAP.md` is v0.15.40; docs exist through v0.15.44. The
release-history audit verifies release contracts, not the roadmap index, so the
drift is unguarded.

## Recommended priority order

1. **Close the live-proof loop on v0.15.44** — deploy and run the fresh
   EduTool.dev audit. Cheap, required by the project's own release protocol,
   and it decides whether F4 work is still needed. (F1)
2. **Generalize the discipline-anchor gate** — derive anchor terms from the
   course's own concept genome/topic vocabulary instead of a hardcoded
   genetics regex, so every discipline gets relevance protection; keep the
   genetics regression as one case of a general mechanism. (F2)
3. **Attack the texture plateau at the blueprint layer** — a capped
   lesson-specific enrichment pass (as the pipeline audit itself recommends)
   rather than a fourth deterministic rewording sweep; gate with the existing
   texture regressions and the blueprint quality matrix. (F3)
4. **Curated license-safe OER registry** for the top recurring disciplines to
   retire the standing P2 license findings. (F4)
5. **Hygiene:** append v0.15.41–44 to ROADMAP.md; rotate live-audit fixtures
   across disciplines. (F5, F6)
