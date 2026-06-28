# v0.15.92 User Experience Design Studio ZIP/Log Audit

Date: June 28, 2026

## Evidence

- App version: `0.15.92`
- Visible EduTool score: `Quality 96` with `Texture 91`
- Local deep regrade: `96/100 (A)`
- ZIP: `package.zip`
- Source ZIP: `/Users/tianxing/Downloads/User Experience Design Studio - Course Materials (8).zip`
- Console logs: `browser-console-current-run.log`, `browser-all.log`, `browser-warn-error.log`
- Run id: `run-1782632546303`
- Finish id: `finish-mqxhhm3z-z7aih`

## Local Regrade

| Dimension | Score |
| --- | ---: |
| identity | 100 |
| substance | 100 |
| citations | 70 |
| honesty | 100 |
| discipline | 100 |
| consistency | 100 |
| structure | 100 |
| format | 100 |
| texture | 91 |

The run had `0 P0`, `0 P1`, and `10 P2` findings. All scored findings were
citation findings against `PACKAGE_MANIFEST.json` source review rows that were
not trusted bibliography proof.

## Score Loss Explanation

### CourseMapper-side citation/export issue

Ten `sourceReviewRows` were exported as package caveats even though they were
not trusted bibliography proof. Most were rejected or false-friend candidates,
including rows such as `Data visualization in society`, `Critical thinking`,
`Reinforcement learning from human feedback`, `Website wireframe`,
`Sally-Anne test`, and `COVID-19 testing`.

This is CourseMapper-side export logic: rejected source-finder candidates should
not keep cluttering instructor review notes when trusted concept-linked sources
already cover the topic. They should remain visible only when there is real
missing-source debt.

### CourseMapper-side DOI/UX anchor issue

The `Qian Yang, Aaron Steinfeld, Carolyn Penstein Rose et al. (2020)` ACM DOI
reading about human-AI interaction is a better candidate for trusted UX proof
than for review-note clutter when it has a DOI, license signal, URL, and concept
link. The source ledger needs to recognize HCI and human-AI interaction as
legitimate UX anchors and infer Crossref-style proof from DOI-bearing ACM links.

### Mixed provider/product texture issue

The provider and compiler produced useful material, but repeated deterministic
tails still appeared across all 12 lessons. The texture grader flagged exact
shingles such as:

- `and critique evidence not only topic recall [n] minutes debrief and exit`
- `and critique evidence not only topic recall [n] minutes independent artifact sprint`
- `and what check would catch it [n] practice workflow practice workflow [slot]`
- `application discussion bloom [slot] take a position on the lesson's live question`
- `are most likely to make and what check would catch it [n]`

Better model output can help with variety, but CourseMapper still needs
deterministic compiler variation so repeated scaffolds do not dominate 12-lesson
packages.

## Release Decision

This audit justifies a narrow `v0.15.93` CourseMapper patch:

- drop unused rejected source-finder candidates from exported review rows when
  trusted concept-linked sources exist;
- promote DOI-backed, CC-licensed UX/HCI syllabus readings into trusted
  concept-linked proof when safe;
- vary the lesson-plan and slide-deck compiler tails that matched the texture
  evidence.

Do not claim a clean `100/100` package from this release. A fresh deployed
`v0.15.93` ZIP/log audit is still required to verify citation cleanup and
texture improvement in real provider output.
