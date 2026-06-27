# EduTool Audit: User Experience Design Studio v0.15.85

Timestamp: 2026-06-27T16:00:00Z

## Inputs

- ZIP: `/Users/tianxing/Downloads/User Experience Design Studio - Course Materials (3).zip`
- Local evidence folder:
  `verification-output/edutool-audit-loop/20260627T160000Z-v01585-ux-fresh`
- Browser logs:
  - `browser-console.log`
  - `browser-console-cm.log`
  - `browser-console-current-run.log`

## Digest

- App version: `0.15.85`
- Run id: `run-1782576010803`
- Finish id: `finish-mqwjuoab-m3b4p`
- Visible quality: `97/100 (A)`, texture `94`
- Digest status: `blocked`
- Export status: passed, `38` checks, `0` failures, `0` warnings
- Digest findings: `0 P0`, `2 P1`, `1 P2`
- Enrichment coverage: `11/12`
- Retry calls: `2`
- Repair retry calls: `2`
- Provider calls: `5`
- Cost: `$0.11`
- Compiler: `9` deliverables compiled locally, about `17` provider calls avoided

## Trace Evidence

v0.15.85 achieved the logging objective. The saved current-run log can explain
the background process without DevTools archaeology:

- `providerRequestStart` rows identify task, provider/model, attempt,
  max retries, max output budget, approximate input tokens, and schema state.
- `providerResponseDone` rows identify output characters and stream chunk count.
- `repairRetryCall` rows show that native enrichment recovery actually retried
  twice before the final partial-enrichment caveat.
- `compilerPlan` and `compiledDeliverable` rows show that the enriched blueprint
  compiler compiled 9 deliverables and avoided about 17 provider calls.
- `[CM][DIGEST]` reconciles those rows with the final package state:
  `repairRetryCallCount=2`, `enrichmentCoverage=0.9166`, and
  `finalStatus=blocked`.

## Package Audit

The ZIP structure is complete: 100 files, all expected deliverable folders,
`PACKAGE_MANIFEST.json`, `QUALITY_REPORT.md`, `SOURCE_REPORT.md`, and
`READINESS_REPORT.txt`.

Exported `QUALITY_REPORT.md` says `97/100 (A)`. After the stricter source
relevance patch in this working tree, local regrade is:

- Overall: `88/100 (B)`
- Findings: `11 P1`, `1 P2`
- Citation score: `20/100`
- Texture: `94/100`

The score loss is not primarily model prose quality. It is CourseMapper-side
source trust and recovery behavior:

1. Trusted UX source ledger rows still included off-discipline or weak rows
   such as `Metaverse beyond the hype`, `IFAC WORKSHOP ON INTERACTIONS BETWEEN
   PROCESS DESIGN AND PROCESS CONTROL`, `Brief Interviews with Hideous Men
   (film)`, `Aircraft design process`, `Persona (series)`, and related generic
   source-finder rows.
2. Lesson 1 stayed on template fallback after two repair/retry calls, producing
   a real partial-enrichment caveat.
3. Readiness correctly blocked export review rather than pretending this was a
   clean package.

## UI Audit

The export panel direction is improved. The downloadable package card is now a
compact state:

- `Ready with notes`
- `Notes in Agent`
- `Download ZIP`

The detailed warnings are in the Agent panel. This is the right information
architecture. The remaining UI work is not to add more export-panel prose; it is
to make the Agent note card more action-oriented after the source and enrichment
issues are fixed.

## Product Finding

The v0.15.85 source quarantine is too narrow. It catches some known UX false
friends, but trusted source rows can still pass through when they share generic
words with the course concept. The fix should be CourseMapper-side:

- require UX/design source anchors or concept-specific source anchors before a
  row becomes trusted concept-linked proof;
- quarantine weak rows into source review notes;
- keep the grader aligned so exported packages cannot silently trust the same
  rows.

## Release Decision

Release justified. The fresh v0.15.85 ZIP/log audit provides real evidence for
v0.15.86:

- broaden UX source relevance gates across knowledge resources and
  source-finder rows;
- keep the new trace logging because it made repair and compiler behavior
  inspectable;
- carry forward partial enrichment recovery for the next quality slice.

