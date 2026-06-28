# EduTool Audit Loop Report — v0.15.94 UX Fresh Run

Generated: 2026-06-28T09:29:23Z

## Evidence

- App version: 0.15.94
- Run ID: `run-1782638796626`
- Finish ID: `finish-mqxl75hl-6tg9s`
- ZIP: `verification-output/edutool-audit-loop/20260628T092923Z-v01594-ux-fresh/package.zip`
- Console log: `verification-output/edutool-audit-loop/20260628T092923Z-v01594-ux-fresh/edutool.dev-after-download.log`
- Extracted package: `verification-output/edutool-audit-loop/20260628T092923Z-v01594-ux-fresh/extracted`

## Result

- Exported score: 97/100 (A), texture 90.
- Local regrade on the v0.15.94 artifact: 97/100 (A).
- Projected local regrade after the stricter v0.15.95 source-truth checks: 96/100 (A), because a hidden trusted source false friend is now scored.

## Findings

- v0.15.94 fixed the prior source-finder bycatch class: the old Studio Ghibli, spiritual practice, strategic planning, Chuck Swindoll, and teacher-feedback rows did not appear in this ZIP.
- The package is still not clean: readiness is blocked because lesson 1 remained on template fallback after one repair/retry call.
- `SOURCE_REPORT.md` still included source review debt from metadata-only or weak rows:
  - `sf3`: `Personas` from Crossref public metadata.
  - `syllabus-src-1-1`: `Journals of Mechatronics Machine Design and Manufacturing`, a UX false friend from generated syllabus text.
- `SOURCE_REPORT.md` also trusted `Prototype-based programming` as proof for UX prototyping. It is real, linked, and licensed, but off-discipline for a UX design studio.

## Decision

Release is justified for a narrow CourseMapper-side source-truth patch. The fix should:

- Require source-finder candidates to be linkable, license-safe, and trusted before graph/ledger attachment.
- Drop metadata-only source-finder fallbacks instead of exporting them as instructor review debt.
- Reject UX false friends for prototype-programming and mechatronics/manufacturing source text.
- Drop generated-syllabus public-metadata false friends while preserving ordinary review notes for non-source-finder rows that are missing proof.

No clean 100/100 claim is made. A fresh deployed v0.15.95 provider audit is required after release.
