# Scion V0.16.99 — Discipline-Safe Sparse Briefs

## Goal

V0.16.99 turns V0.16.98’s causal texture measurement into a measured compiler-quality repair. Sparse briefs now receive course-aware teaching language instead of a small generic sentence inventory, while course knowledge and current-source research fail closed at discipline boundaries.

This is a compiler, evidence-routing, and assessment-classification release. It does not change Gemma weights, activate the optional adapter, prove factual correctness, certify accessibility, or provide instructor/classroom validation.

## Lane — Discipline-safe sparse generation

### Sparse-brief compiler realization

- The compiler resolves precise teaching lenses for marine biology, corporate tax, counterpoint, epidemiology, civil procedure, materials science, language pedagogy, urban planning, clinical ethics, database systems, modern art history, exercise physiology, and oral-history methods.
- Sparse assignment, quiz, slide, example, misconception, warm-up, and essay surfaces compose from the course, lesson, evidence, learner role, and decision context.
- Cross-package masking excludes source placeholders that contain no comparable compiler frame, separating a measurement correction from an output-quality change.

### Knowledge and research boundaries

- Genome linking now fails closed when a course cannot be assigned a known discipline. Unclassified courses cannot silently borrow a psychology, business, or other unrelated shard.
- Database research routes ambiguous lesson names to canonical DBMS sources for models, SQL, normalization, query planning, transactions, security, NoSQL, and performance.
- Oral-history research routes interview design, recording/transcription, thematic coding, presentation, and project-planning lessons to relevant source families.
- Course-aware source gates reject enterprise BTM for database transactions, moral integrity for database security, generic data analysis for thematic transcript coding, and unrelated open-web papers for oral-history lessons.
- Research cache V19 prevents previously admitted weak candidates from reappearing.
- The sentence splitter preserves middle initials such as “Edgar F. Codd.”
- Exact evidence binding accepts a compact model-selected subset of a larger verified fact ledger, while still rejecting paraphrases or added claims.

### Discipline and assessment false friends

- Database “relational algebra” routes to schema/query/execution evidence rather than mathematics answer-check language.
- “Oral History” routes to interview, narrator-context, consent, recording, transcript, archive, and public-history teaching moves rather than Western-civilization survey or UX-prototype language.
- “Oral History” no longer classifies an assignment as a spoken-language performance. Real oral presentations, performances, speaking tasks, defenses, and exams keep their prompt-sheet and speaking-rubric behavior.

## Retained cross-package proof

Both retained panels pass the V0.16.98 no-regression comparator.

| Panel / view                  | K≥2 clusters | K=2 clusters | Reader exposure | Cross-package excess | Provenance coverage |
| ----------------------------- | -----------: | -----------: | --------------: | -------------------: | ------------------: |
| Thin, input-mask/path-free    |          502 |          181 |           9.01% |                6.23% |              89.71% |
| Thin, consumed-slot/path-free |        1,124 |          383 |          28.48% |               20.84% |              89.71% |
| Gold, input-mask/path-free    |          536 |          273 |          18.87% |               12.93% |              92.13% |
| Gold, consumed-slot/path-free |          404 |          215 |          14.62% |                9.68% |              92.13% |

Against the V0.16.98 thin characterization, input-mask/path-free K≥2 clusters fall from 536 to 502, K=2 clusters from 195 to 181, reader exposure from 9.78% to 9.01%, and cross-package excess from 6.75% to 6.23%. The consumed-slot exposure change from 38.47% to 28.48% includes both the placeholder-mask correction and real course-aware fallback changes; it is not presented as a pure 9.99-point wording win.

The gold panel holds its strong-source behavior: reader exposure is 18.87% versus 19.32% in V0.16.98, cross-package excess is 12.93% versus 13.35%, no existing retained cluster grows, and no new universal high-salience cluster appears.

## Fresh browser/ZIP proof

### Database Systems

- Sparse brief: “Database Systems, an 8-week undergraduate course for information systems students.”
- Ready in 35 seconds.
- 8/8 course-map lessons, 8/8 lesson kernels, 9/9 material families.
- Automated Readiness 65/100; evidence grounding 100/100; instructional specificity 97/100.
- Package conformance 99/A with 0 P0, 0 P1, and 0 P2 findings.
- 67 files and 22 trusted source-ledger rows.
- Source-reference coverage is complete: outcomes 8/8, activities 16/16, examples 8/8, assessments 8/8, rubric criteria 24/24, and factual claims 16/16.
- Physical ZIP: `Database Systems - Course Materials (5).zip`.

The run removed observed psychology/business-ethics shard contamination, enterprise BTM ambiguity, false quiz review, mathematics evidence framing, and missing normalization/security citations.

### Community Oral History Methods

- Sparse brief: “Community Oral History Methods, a 6-week undergraduate seminar for local history students.”
- Same-brief before/after: ready time 48 → 29 seconds; Automated Readiness 58 → 62; evidence grounding 61 → 84; instructional specificity 97 → 98; texture 95 → 96.
- 6/6 course-map lessons, 6/6 lesson kernels, 9/9 material families.
- Package conformance 99/A with 0 P0, 0 P1, and 0 P2 findings.
- 51 files.
- Physical ZIP: `Community Oral History Methods - Course Materials (1).zip`.

The first fresh run was structurally green but semantically wrong: it mentioned Western civilization before 1500, admitted an unrelated wastewater-epidemiology paper, used UX prototype/portfolio language, and classified “Oral History” as a spoken-language performance. The final browser and ZIP inspection contains none of those phrases. Its assignment brief uses interview/transcript records, narrator context, consent status, and evidence limits, with ordinary evidence-analysis criteria instead of pronunciation and fluency.

## Reproduction

```bash
npm run audit:texture:cross-package -- --profile thin --compare-baseline
npm run audit:texture:cross-package -- --profile gold --compare-baseline
npm test
npm run test:blueprint:quality:fast
npm run audit:contract:pr
npm run audit:evaluation:pr
npm run build
npm run bundle:check
npm run audit:release-history
```

Browser acceptance was performed at `http://127.0.0.1:5173/` with real current-source requests and physical ZIP downloads. The downloaded packages and extracted reports are retained locally under `verification-output/v0.16.99-browser-*`.

## Release Boundary

The oral-history package retains strong source receipts for five of six lessons; the remaining evidence limits are reported rather than padded with unrelated sources. Automated Readiness remains capped below 70 without independent evidence. V0.16.99 therefore claims a measured discipline, grounding, texture, export, and latency improvement on these exact routes—not universal course quality.
