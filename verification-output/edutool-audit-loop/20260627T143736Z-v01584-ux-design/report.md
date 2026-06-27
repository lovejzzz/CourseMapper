# EduTool Audit: User Experience Design Studio v0.15.84

Timestamp: 2026-06-27T14:37:36Z

## Inputs

- ZIP: `/Users/tianxing/Downloads/User Experience Design Studio - Course Materials (2).zip`
- Console log: `/Users/tianxing/Downloads/edutool.dev-1782570956613.log`
- Local evidence folder:
  `verification-output/edutool-audit-loop/20260627T143736Z-v01584-ux-design`

## Digest

- App version: `0.15.84`
- Run id: `run-1782570767701`
- Finish id: `finish-mqwgpjpw-70raf`
- Export status: passed, 38 checks, 0 failures, 0 warnings
- In-app/exported quality: `99/100 (A)`, texture `93`
- P0/P1/P2 in exported report: `0/0/0`
- Enrichment coverage: `1`
- Repairs applied: `8`
- Retry calls: `0`
- Repair retry calls: `0`
- Voice pass: `7` voiced, `1` fallback
- Cost: `$0.11`

## Local Regrade

Patched local regrade with the current source-ledger checks:

- Overall: `93/100 (A)`
- Findings: `6 P1`, all citation/source-ledger relevance
- Texture: `93/100`

The score drop is not a model-quality mystery. It is CourseMapper-side source
trust accounting: the package promoted weak source-finder rows into trusted
concept-linked source-ledger proof.

Flagged trusted rows:

- `sf2`: `Positive feedback`
- `sf6`: `Layout Editor Configuration`
- `sf7`: `One more thing ... Patterns 2.0`
- `sf-1-2`: `Metaverse beyond the hype: Multidisciplinary perspectives on emerging challenges, opportunities, and agenda for research, practice and policy`
- `sf-2-2`: `Climate change feedbacks`
- `sf-6-2`: `Re-Layout The Layout Of Shoe Production Facilities Using Systematic Layout Planning And Blocplan Methods`

Texture advisories remain concentrated in repeated lesson-plan and slide-deck
tails, especially the repeated `critique evidence not only topic recall` and
`practice workflow` scaffolds.

## UI Finding

The export panel repeated the same amber “Ready with notes” explanation already
shown in the Agent panel. The product fix is to keep the export card as a simple
download state and route the detailed notes to the Agent panel.

## Runtime Finding

The console log included `QuotaExceededError` while saving the current
conversation payload. This is CourseMapper-side local persistence pressure, not
a provider failure.

## Release Decision

Release justified. v0.15.85 patches:

- richer non-secret API and compiler trace logs,
- simple export-panel note copy,
- local conversation quota recovery,
- UX source-finder false-friend quarantine,
- source-ledger grader detection for trusted UX false-friend rows.

Fresh deployed v0.15.85 evidence is still required before claiming the UX source
issue is fixed in provider output.
