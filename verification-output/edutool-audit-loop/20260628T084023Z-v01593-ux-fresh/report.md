# v0.15.93 User Experience Design Studio ZIP/Log Audit

Date: June 28, 2026

## Evidence

- App version: `0.15.93`
- Visible EduTool score: `Quality 97` with `Texture 94`
- Local deep regrade: `97/100 (A)`
- ZIP: `package.zip`
- Source ZIP: `/Users/tianxing/Downloads/User Experience Design Studio - Course Materials (10).zip`
- Console logs: `browser-console-current-run.log`, `browser-all.log`, `browser-warn-error.log`
- Run id: `run-1782635830013`
- Finish id: `finish-mqxjfsaq-93912`

## Local Regrade

| Dimension | Score |
| --- | ---: |
| identity | 100 |
| substance | 100 |
| citations | 82 |
| honesty | 100 |
| discipline | 100 |
| consistency | 100 |
| structure | 100 |
| format | 100 |
| texture | 94 |

The run had `0 P0`, `0 P1`, and `6 P2` findings. All scored findings were
citation findings against `PACKAGE_MANIFEST.json` source review rows that were
not trusted bibliography proof.

## Score Loss Explanation

### CourseMapper-side source-finder bycatch issue

The remaining quality loss is not model prose quality. The package still
exported weak source-finder candidates as instructor review notes:

- `List of Studio Ghibli works`
- `Spiritual practice`
- `Strategic planning`
- `Chuck Swindoll`
- `Digital video-based peer feedback training...`
- `A/B testing`

The first five are source-finder bycatch for a UX course. They should not count
as trusted source proof and should not clutter instructor review notes. The
source-finder attachment path also counted these first-result rows as open
resources before the stricter source ledger rejected them.

### CourseMapper-side UX anchor issue

`A/B testing` is legitimate UX/usability-testing background when it is linked to
test planning, task design, or results. It was quarantined because the UX anchor
gate recognized `user experience` with a space but missed hyphenated
`user-experience` evidence.

### Texture trend

Texture improved from the v0.15.92 baseline: `91` to `94`. The remaining score
loss is no longer texture-scored in this artifact, but the package still has
visible repeated scaffolds such as "Quick evidence check" in the Course Map
surface. Continue treating texture below 100 as an improvement target, even when
it is not the current scored loss.

## Release Decision

This audit justifies a narrow `v0.15.94` CourseMapper patch:

- apply the UX weak-source gate before source-finder candidates are attached as
  graph resources;
- discard weak source-finder bycatch instead of exporting it as source review
  debt;
- preserve real review rows for missing source proof, ambiguous licenses, or
  weak non-source-finder resources;
- accept hyphenated `user-experience` and concept-linked `A/B testing` as valid
  UX source anchors.

Do not claim a clean `100/100` package from this release. A fresh deployed
`v0.15.94` ZIP/log audit is still required to verify that source-finder bycatch
no longer appears as exported review rows or open-resource proof.
