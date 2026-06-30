# EduTool Audit Report — v0.15.146 Fresh Provider Run

Timestamp: `20260630T054226Z-v015146-fresh`

Course: User Experience Design Studio

## Artifacts

- App URL: `https://edutool.dev/?codexAudit=20260630-v015146-fresh-1782798146000`
- Downloaded ZIP: `package.zip`
- Extracted package: `extracted/`
- Chrome console log: `chrome-devtools-cm-log.json`
- Digest: `digest.json`
- Original local regrade: `local-regrade.json`
- Corrected local regrade after detector/export patch: `postfix-local-regrade.json`

## Completion Evidence

- App version: `0.15.146`
- Run ID: `run-1782798281654`
- Finish ID: `finish-mr0875zf-0hiqs`
- Visible completion: `Quality 98 · Texture 96`
- Materials: `12/12`
- Export verification: passed, 38 files, 0 failed, 0 warnings
- Provider calls: 4
- Voice pass: completed over 8 surfaces, voice-surface texture `97→98`
- Download capture: Chrome download event timed out after 20s, but a new ZIP appeared in Downloads and was copied into this audit folder.

## Package Audit

The exported package structure was complete. `PACKAGE_MANIFEST.json`, `QUALITY_REPORT.md`, and `SOURCE_REPORT.md` were present.

Original package quality from the embedded report and first local regrade:

- Overall: `98/100 (A)`
- Findings: `0 P0 · 1 P1 · 0 P2`
- Texture: `96/100`
- Finding: `prompt artifact labels used as lesson concepts`
- File: `Quiz & Exam Bank/Lesson 02 - Personas - Quiz & Exam Bank.docx`
- Evidence: `ANSWERA defensible position: Personas should focus on the most common patterns to stay usable... managing assignments, deadlines...`

`PACKAGE_MANIFEST.json` correctly set readiness to `warnings` and included a `qualityGate` warning, so the v0.15.146 manifest-readiness truth fix held.

## Source Evidence

`SOURCE_REPORT.md` listed 8 trusted, licensed, concept-linked source ledger rows:

- Persona — Wikipedia — CC BY-SA 4.0
- Information architecture — Wikipedia — CC BY-SA 4.0
- Human-computer interaction — Wikipedia — CC BY-SA 4.0
- Accessibility — Wikipedia — CC BY-SA 4.0
- Usability testing — Wikipedia — CC BY-SA 4.0
- Interaction design — Wikipedia — CC BY-SA 4.0
- Web accessibility — Wikipedia — CC BY-SA 4.0
- A/B testing — Wikipedia — CC BY-SA 4.0

The visible source rows were on-topic for a UX design studio, license-safe, and concept-linked. SourceRef coverage was complete across outcomes, activities, examples, assessments, rubric criteria, and factual claims.

## Diagnosis

The remaining P1 was a CourseMapper-side false positive, not provider model failure.

The detector matched `focus on` in a legitimate persona answer and then matched the ordinary domain phrase `managing assignments` within the broad nearby-artifact window. That text was not using the CourseMapper artifact label `Assignment Briefs`; it was valid UX course content about student scheduling and notification needs.

The same evidence exposed a real DOCX readability issue: answer callout text extracted as `ANSWERA...` because the tracked uppercase `ANSWER` label and the body run had no extractable separator.

## Corrected Regrade

After narrowing the detector and adding an extractable answer-callout separator, the same captured ZIP regraded cleanly:

- Corrected local regrade: `100/100 (A)`
- Findings: `0 P0 · 0 P1 · 0 P2`
- Texture: `96/100`

This proves the v0.15.146 ZIP content itself was clean under the corrected product logic. A fresh deployed v0.15.147 provider run is still required before claiming new-run output is clean.

## Decision

Release justified: yes, narrow product/grader/export truth patch.

Next audit target: fresh deployed v0.15.147 ZIP/log run to confirm the corrected detector and answer-callout rendering hold in real provider output.
