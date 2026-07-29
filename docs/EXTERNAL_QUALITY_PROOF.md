# External Quality Proof Intake

CourseMapper's internal audits can show that the compiler is complete, traceable, and stable. They cannot prove true classroom quality by themselves. To claim A-quality, `audit:expert` needs external evidence from reviewers or instructor edit histories.

## What Counts

An external fixture is proof-eligible only when it includes all of the following:

- `evidenceType: "external"`
- `reviewerRole`, such as `"external methods instructor"` or `"instructional designer"`
- `reviewEvidence.reviewerType`, such as `"external-expert"` or `"external-instructor"`
- `reviewEvidence.reviewedAt`
- `reviewEvidence.reviewedPackageVersion`
- `reviewEvidence.reviewedArtifacts`
- At least one concrete reviewer expectation, reviewer scorecard, edit check, preference expectation, blueprint expectation, or instructor edit pattern

If any of these are missing, the audit may still run, but the fixture does not count as external quality proof.

For the stricter A-quality release gate, the strongest proof must be tied to complete reviewed course samples, not loose evidence fragments. The audit now reports `External complete proof samples`, `External complete proof modalities`, `External complete proof scopes`, `External complete proof scope tags`, `External-project complete proof samples`, and `External-project required-scope proof`. It blocks stitched proof where the scorecard belongs to one sample, source-fidelity, blueprint-quality, or assumption evidence belongs to another, and instructor edit history belongs to a third. It also blocks A-quality release proof until complete samples cover at least two teaching modalities, include at least one sample compiled from an externally supplied `project.courseMap` at one of the required `5`, `8`, or `14` lesson proof scopes rather than only a curated built-in sample, and cover short-module, standard, and full-semester course lengths (`5`, `8`, and `14` lessons). A complete proof sample has the full-package scorecard, source-fidelity review, blueprint-quality review, assumption-ledger decisions, and concrete external edit-history evidence all referring to the same reviewed sample.

For the stricter A-quality release gate, at least one proof-eligible external reviewer scorecard must cover the full core package. Use either `"full-package"` in `reviewEvidence.reviewedArtifacts`, or list every core artifact: `syllabus`, `lessonPlans`, `slideDecks`, `assignments`, `rubrics`, `discussions`, `quizBank`, `studyGuides`, and `courseFaq`.

The strict gate also needs at least one proof-eligible external `sourceFidelityReview` confirming that the reviewer compared the original source course map against the compiled package. It must include `sourceInputReviewed: true`, `compiledPackageReviewed: true`, concrete notes, and `artifactReviews` rows for every core compiled artifact. Each artifact row must confirm source comparison, package comparison, preserved source signals, visible compiler decision, visible publish gate, visible model-use policy, visible handoff review focus, visible local-review action, and concrete evidence notes that name the local-review or publish-before-use action the reviewer saw. Reviews that report broken lesson order, lost assessments, lost source signals, hidden publication boundaries, hidden local-review actions, generic local-review notes, or high unsupported-invention risk block A-quality proof.

The strict gate also needs at least one proof-eligible external `blueprintQualityReview` confirming that the reviewer compared the original source course map against the compact blueprint before scoring compiled artifacts. It must include `sourceInputReviewed: true`, `blueprintReviewed: true`, `compactRepresentationReviewed: true`, concrete notes, and `lessonReviews` rows for every blueprint lesson. Each lesson row must confirm source comparison, blueprint comparison, preserved source signals, preserved assessment signals, usable alignment, visible review flags, and concrete evidence notes. Reviews that report lost source signals, lost assessments, unusable alignment, hidden review flags, or high unresolved blueprint risk block A-quality proof.

The strict gate also needs at least one proof-eligible external `assumptionLedgerReview` confirming that the reviewer inspected the blueprint assumption ledger. It must include `assumptionLedgerReviewed: true`, `reviewRequiredRowsReviewed: true`, concrete notes, `categoriesReviewed` covering the ledger categories in the reviewed packet, and `reviewedRows` decisions for review-required assumptions. Reviews that leave high-risk assumptions unresolved block A-quality proof.

## Fixture Shape

Use [expert-review-fixture.template.json](./expert-review-fixture.template.json) as a compact shape reference. For strict A-quality proof, prefer the generated combined templates from `npm run audit:expert:packet`, especially `verification-output/external-quality-proof-packet/fixtures/external-project.combined-fixtures.template.json` for real course maps.

Copy the template to a private review file, replace the example values with real reviewer evidence, and remove `templateOnly` before running the audit. Unchanged template fixtures are blocked and do not count as proof.

Fixtures can point to a curated `sampleId` or include their own `project.courseMap`.

External proof metadata must be concrete and tied to the current package version in `package.json`. Do not leave values such as `YYYY-MM-DD`, `Replace with...`, `TBD`, `template`, or `placeholder` in `reviewEvidence.reviewedAt`, `reviewEvidence.reviewedPackageVersion`, `reviewEvidence.reviewedArtifacts`, or `reviewEvidence.evidenceSource`; the audit blocks those fixtures instead of counting them as proof. If `reviewEvidence.reviewedPackageVersion` does not match the current CourseMapper package version, the fixture is treated as stale proof and must be regenerated/re-reviewed for the current release.

External project course maps and positive reviewer expectations must also be filled with real content. Removing `templateOnly` is not enough if `project.courseMap`, `packageMustMatch`, `featureExpectations`, `preferenceExpectations`, blueprint expectations, or positive edit checks still contain placeholder text such as `Replace with...` or `placeholder`.

To prepare a review packet with source course maps, compact blueprint review files, compiled package excerpts, full-package reviewed-artifact lists, scorecard dimensions, and fixture templates, run:

```bash
npm run audit:expert:packet
```

The packet is written to `verification-output/external-quality-proof-packet/latest.md` and a compact `latest.json` manifest. It also writes original source course-map review files under `verification-output/external-quality-proof-packet/source-inputs/`, compact blueprint review files under `verification-output/external-quality-proof-packet/compact-blueprints/`, and full compiled review artifacts for each sample under `verification-output/external-quality-proof-packet/full-package/`, with one structured `.md` file and one `.json` file per sample in each directory. Reviewers should compare source-input files against compact-blueprint files before scoring the compiled package, then compare both against the full-package files before scorecards. The per-sample JSON files preserve the full structured review data for audit traceability, including per-lesson compiler decisions, publish gates, source-review focus, local-review actions, compact blueprint review rows, and full `reviewData` for each artifact. Full-package Markdown also includes a Local Review Actions matrix near the top so reviewers can fill `sourceFidelityReview.artifactReviews[].localReviewActionVisible` from a compact table before inspecting long artifact excerpts. The reviewer-facing Markdown is bounded so a packet remains practical to inspect; when a long section is truncated, the paired JSON keeps the complete structured data. The main `latest.md` file is also kept as an index plus detailed evidence for the recommended strict-proof bundle instead of rendering every curated sample in full; all other sample review files remain available through the Available Sample File Index. The `latest.json` file is intentionally an index manifest: it keeps compact sample status, quality summaries, and file paths, while source details, compact blueprint structures, full package structures, and fixture templates live in the per-sample JSON and fixture files. The packet also writes reviewer intake forms under `verification-output/external-quality-proof-packet/review-intake/` and standalone fixture JSON templates under `verification-output/external-quality-proof-packet/fixtures/`, including a combined review-plus-edit-history fixture bundle per curated sample, `fixtures/external-project.combined-fixtures.template.json` for the required real `project.courseMap` proof sample, and `fixtures/recommended-strict-proof-bundle.template.json` as the one-file starting point for the recommended strict proof set. That recommended bundle embeds the reviewer completion checklist and points back to `review-intake/reviewer-completion-checklist.md`, so private reviewer bundles still carry the exact required fields when copied out of the packet directory. When no real external course map is already included, the checklist adds an explicit `external-reviewed-course-project` row with `project.courseMap.courseName`, `project.courseMap.lessons[]`, and required proof-scope fields so the certification blocker is not only hidden in the global checklist. The proof collection plan recommends strict proof bundle samples that cover `5`, `8`, and `14` lesson scopes while varying modality, and the external-project starting point now tells reviewers to supply a real reviewed `5`-, `8`-, or `14`-lesson course map so real-source evidence contributes to strict scope proof. It also includes a Recommended Bundle Coverage table that shows whether the recommended bundle already satisfies sample count, modality, real-course-at-required-scope, and scope coverage before reviewers spend time filling evidence. Reviewers can complete `recommended-strict-proof-bundle.template.json`, replace any included external-project placeholder with a real reviewed course map at a required proof scope, remove `templateOnly` from the bundle and its fixtures, run the proof preflight, and then run the strict external proof gate directly. You can limit curated samples with `-- --sample gold-spanish-healthcare-8`, but the strict A-quality gate still needs the full scope coverage and at least one completed external-project fixture at a required proof scope.

The top-level `templateOnly` flag on a fixture bundle is also enforced. `audit:expert:preflight` reports `bundleTemplateOnly` until the completed bundle has real reviewer evidence and the top-level template marker is removed, even if individual fixture rows look complete.

After filling the external-project template with a real course map, generate that course's source-input, compact-blueprint, and full-package review artifacts with:

```bash
npm run audit:expert:packet -- --fixtures /path/to/external-project.combined-fixtures.json --external-only
```

This writes the same source-input, compact-blueprint, full-package, review-intake, and combined fixture files for the externally supplied course map, so reviewers can inspect source compression and the actual compiled package before completing the strict proof fixture.

The external-only packet command refuses empty fixture sets and unfilled course-map templates. If `project.courseMap` still contains placeholder text such as `Replace with...`, `TBD`, or `placeholder`, fill the real reviewed course source first; otherwise reviewers would be scoring a fake source package.

The packet includes more than artifact excerpts. Reviewers now see the original source course map, a standalone compact blueprint review file, course-level learner context, course-modality profile, modality-specific teaching routine, classroom handoff status, the blueprint assumption ledger, package-coherence status plus per-lesson coherence rows, publish-boundary guidance, lesson source confidence, section-by-section source coverage for multi-section lessons, modality-fit cue, assessment artifact, evidence requirement, success criteria, explicit teaching intent, target construct, criterion-level evidence cue, scorer norming, grading bias check, student transparency cue, feedback/revision path, transfer evidence, source-integrity guidance, accessibility/participation cue, local-review flags, and a full artifact inventory that points to the full-package review files. Reviewer scorecard templates also include dimension-specific review prompts so notes can cite the exact evidence being judged.

Supported `sampleId` values currently come from the curated gold samples:

- `gold-research-methods-8`
- `gold-research-methods-short-5`
- `gold-research-methods-semester-14`
- `gold-ai-course-design-8`
- `gold-community-health-8`
- `gold-interaction-design-studio-8`
- `gold-spanish-healthcare-8`
- `gold-clinical-judgment-8`
- `gold-clinical-placement-8`
- `gold-beginning-spanish-8`
- `gold-field-placement-8`
- `gold-biology-lab-8`
- `gold-multi-section-seminar-8`
- `gold-online-writing-workshop-8`
- `gold-quantitative-problem-set-8`
- `gold-statistics-inference-8`
- `gold-accounting-finance-8`
- `gold-policy-analysis-8`
- `gold-economics-analysis-8`
- `gold-ethics-argument-8`
- `gold-proof-seminar-8`
- `gold-lecture-exam-8`
- `gold-capstone-project-8`
- `gold-competency-assessment-8`
- `gold-performing-arts-8`
- `gold-programming-lab-8`
- `gold-data-science-lab-8`
- `gold-engineering-design-8`
- `gold-creative-writing-8`
- `gold-business-strategy-case-8`
- `gold-constitutional-law-8`
- `gold-sparse-assessment-resilience-8`
- `gold-messy-clinical-resilience-8`

For real course review evidence, prefer `project.courseMap` so the audit compiles and checks the actual reviewed course instead of a curated internal sample. The course map must include `courseName` and at least one lesson.

Reviewer expectations can be supplied as regex strings, for example `"/empirical evidence/i"`, or plain text strings. Feature-level checks go under `featureExpectations`.

Reviewer scorecards can be supplied as `reviewScorecard.dimensions`. Scores are normalized to a 10-point scale and must meet the default A-quality floor of `9/10` unless `reviewScorecard.floor` is set higher. A scorecard must cover all six classroom-quality dimensions used by the gold audit:

- `instructional-alignment`
- `teachability`
- `assessment-authenticity`
- `feedback-and-revision`
- `cognitive-progression`
- `accessibility-and-trust`

Each external scorecard dimension must also include a concrete reviewer note, at least one reviewed artifact in `evidenceArtifacts`, and at least one concrete support detail in `evidenceExamples`. Blank notes and template text such as `Replace with reviewer notes.` block the fixture, even when the numeric score is high.

Example:

```json
{
  "reviewScorecard": {
    "maxScore": 5,
    "dimensions": [
      {
        "id": "instructional-alignment",
        "label": "Instructional alignment",
        "score": 4.5,
        "evidenceArtifacts": ["syllabus", "lessonPlans", "assignments"],
        "evidenceExamples": [
          "Objectives, lesson practice, assignment criteria, and success criteria all point to source-backed method decisions."
        ],
        "notes": "Ready with minor local edits."
      },
      {
        "id": "teachability",
        "label": "Teachability",
        "score": 4.5,
        "evidenceArtifacts": ["lessonPlans", "slideDecks", "studyGuides"],
        "evidenceExamples": [
          "Lesson plans include timed routines, instructor moves, slide-note cues, and study-guide handoffs that can be taught without rewriting."
        ],
        "notes": "Ready with minor local edits."
      },
      {
        "id": "assessment-authenticity",
        "label": "Assessment authenticity",
        "score": 4.5,
        "evidenceArtifacts": ["assignments", "rubrics", "quizBank"],
        "evidenceExamples": [
          "The assignment asks students to make method decisions with evidence, while the rubric and quiz bank score the same performance criteria."
        ],
        "notes": "Ready with minor local edits."
      },
      {
        "id": "feedback-and-revision",
        "label": "Feedback and revision loop",
        "score": 4.5,
        "evidenceArtifacts": ["assignments", "rubrics", "lessonPlans"],
        "evidenceExamples": [
          "Draft checkpoints, rubric feedback moves, and lesson-level recheck cues give students a visible revision path before final submission."
        ],
        "notes": "Ready with minor local edits."
      },
      {
        "id": "cognitive-progression",
        "label": "Cognitive progression",
        "score": 4.5,
        "evidenceArtifacts": ["courseMap", "lessonPlans", "quizBank"],
        "evidenceExamples": [
          "The course moves from retrieval and guided practice into analysis, evaluation, and transfer-synthesis quiz roles across the lesson sequence."
        ],
        "notes": "Ready with minor local edits."
      },
      {
        "id": "accessibility-and-trust",
        "label": "Accessibility and trust",
        "score": 4.5,
        "evidenceArtifacts": ["syllabus", "courseFaq", "studyGuides"],
        "evidenceExamples": [
          "The package identifies participation options, local review flags, source-grounding limits, and student-facing support expectations."
        ],
        "notes": "Ready with minor local edits."
      }
    ]
  }
}
```

Source-fidelity example:

```json
{
  "sourceFidelityReview": {
    "sourceInputReviewed": true,
    "compiledPackageReviewed": true,
    "lessonOrderPreserved": true,
    "assessmentsPreserved": true,
    "unsupportedInventionRisk": "low",
    "artifactReviews": [
      {
        "featureId": "syllabus",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "The syllabus keeps the source course arc, assessment roles, and local-review caveats without adding unsupported policy claims."
      },
      {
        "featureId": "lessonPlans",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Lesson plans preserve the source lesson order, objectives, practice themes, and assessment handoffs."
      },
      {
        "featureId": "slideDecks",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Slides use source lesson concepts and speaker notes match the documented teaching routine."
      },
      {
        "featureId": "assignments",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Assignment briefs preserve source assessment evidence and avoid invented grading policies."
      },
      {
        "featureId": "rubrics",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Rubric criteria align with the source assessment artifacts and stated success criteria."
      },
      {
        "featureId": "discussions",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Discussion prompts preserve source concepts and ask for evidence tied to the lesson objectives."
      },
      {
        "featureId": "quizBank",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Quiz and exam items stay aligned to the source objectives and assessment progression."
      },
      {
        "featureId": "studyGuides",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Study guides preserve the course vocabulary, practice expectations, and review focus."
      },
      {
        "featureId": "courseFaq",
        "sourceCompared": true,
        "packageCompared": true,
        "sourceSignalsPreserved": true,
        "compilerDecisionVisible": true,
        "publishGateVisible": true,
        "modelUsePolicyVisible": true,
        "handoffReviewFocusVisible": true,
        "localReviewActionVisible": true,
        "unsupportedInventionRisk": "low",
        "notes": "Course FAQ answers stay within source-grounded course logistics and review boundaries."
      }
    ],
    "notes": "The compiled package preserves the source lesson sequence, assessment evidence, and local-review boundaries across all core artifacts."
  }
}
```

Blueprint-quality example:

```json
{
  "blueprintQualityReview": {
    "blueprintReviewed": true,
    "sourceInputReviewed": true,
    "compactRepresentationReviewed": true,
    "sourceSignalsPreserved": true,
    "assessmentsPreserved": true,
    "alignmentUsable": true,
    "unresolvedBlueprintRisk": "low",
    "lessonReviews": [
      {
        "lessonNumber": 1,
        "sourceCompared": true,
        "blueprintCompared": true,
        "sourceSignalsPreserved": true,
        "assessmentPreserved": true,
        "alignmentUsable": true,
        "reviewRequiredFlagsVisible": true,
        "notes": "The compact blueprint preserves the source lesson topic, assessment artifact, source-use limits, local-review flags, and lesson-to-package alignment."
      },
      {
        "lessonNumber": 2,
        "sourceCompared": true,
        "blueprintCompared": true,
        "sourceSignalsPreserved": true,
        "assessmentPreserved": true,
        "alignmentUsable": true,
        "reviewRequiredFlagsVisible": true,
        "notes": "The blueprint row keeps the source objectives, practice expectations, assessment evidence, and review-required assumptions visible before compilation."
      }
    ],
    "notes": "The reviewer compared source course-map lessons against the compact blueprint and found source compression faithful enough to decode into classroom materials."
  }
}
```

Assumption-ledger example:

```json
{
  "assumptionLedgerReview": {
    "assumptionLedgerReviewed": true,
    "categoriesReviewed": ["learner-context", "course-modality", "assessment-weight", "handoff-boundary"],
    "reviewRequiredRowsReviewed": true,
    "reviewedRows": [
      {
        "category": "learner-context",
        "coverage": "all review-required rows in this category",
        "decision": "Confirmed for this reviewed course",
        "notes": "The inferred learner role and support assumptions match the reviewed course source and instructor expectations."
      },
      {
        "category": "course-modality",
        "coverage": "all review-required rows in this category",
        "decision": "Confirmed for this reviewed course",
        "notes": "The modality routine fits the source activities and the compiled package does not use an unrelated teaching model."
      },
      {
        "category": "assessment-weight",
        "coverage": "all review-required rows in this category",
        "decision": "Hold for local confirmation",
        "notes": "Draft planning weights are useful for review, but official grading percentages still require instructor confirmation."
      },
      {
        "category": "handoff-boundary",
        "coverage": "all review-required rows in this category",
        "decision": "Confirmed with local review note",
        "notes": "The package clearly flags official dates, copyrighted readings, and institution policies for human confirmation."
      }
    ],
    "unresolvedAssumptionRisk": "low",
    "notes": "The assumption ledger was reviewed against the source course map and all review-required categories have concrete decisions."
  }
}
```

Instructor edit history can be supplied in any of these arrays:

- `instructorEditPatterns`
- `editHistory`
- `instructorEditHistory`

For external edit proof, set `editHistoryEvidenceType: "external"` and include edit patterns with `featureId`, `field`, `action`, and concrete edit evidence. Each pattern needs either before/after wording or notes explaining the accepted instructor edit and why that edit should become a learned preference.

## Run

Keep real review files outside the repo if they contain private reviewer or instructor data, then run:

```bash
npm run audit:expert -- --fixtures /path/to/external-review-fixtures.json
```

Before making an A-quality claim, use the proof preflight. It runs the same strict external-proof requirements and adds an explicit readiness checklist to the report:

```bash
npm run audit:expert:preflight -- --fixtures /path/to/external-review-fixtures.json
```

When preparing an A-quality release claim, run the stricter external-proof gate:

```bash
npm run audit:expert:external -- --fixtures /path/to/external-review-fixtures.json
```

Reviewer packets also include the source-conflict report. When a source course map has duplicate or contradictory lesson rows, reviewers should confirm whether the rows should be merged, split, renumbered, or replaced before counting the package as classroom-ready.

External reviewers should complete `sourceFidelityReview.artifactReviews` for every core artifact. These rows are the evidence that the reviewer compared the original course-map source to each compiled output, not only to the package as a whole. Each row must also confirm that the artifact makes the compiler decision, publish gate, model-use policy, handoff review focus, and local-review action visible to an instructor. The row notes must name the local-review or publish-before-use action the reviewer saw; a generic "review flags are visible" note is not enough.

Reviewer packets also expose assessment-weight provenance. Weights marked `course-map-explicit` came from source grading percentages; weights marked `compiler-distributed-by-assessment-role` are draft planning weights and should not be treated as official grading policy until the instructor confirms them.

External reviewers should complete `blueprintQualityReview.lessonReviews` before scoring the compiled package. These rows are the evidence that the compact blueprint preserved each source lesson's topic, assessment signal, instructional alignment, and review flags before the compiler decoded it into multiple artifacts.

Reviewer packets also expose the blueprint assumption ledger. The ledger is the human-readable explanation of what the compiler believed, inferred, or requires local confirmation for learner context, modality, source provenance, source risk, source conflicts, assessment weights, compiler decisions, and publication boundaries.

External reviewers should record a decision for each review-required assumption row in `assumptionLedgerReview.reviewedRows`. Each row should identify the ledger row or category, state whether the assumption was confirmed, revised, or held for local confirmation, and include concrete evidence notes. Category-wide decisions are accepted only when the row uses a coverage value such as `all review-required rows in this category`.

This mode fails unless the fixture set proves all of the following:

- External review and concrete external edit-history evidence are both present
- External review fixtures name the current CourseMapper package version, not an older reviewed build
- At least two external proof samples across at least two teaching modalities combine the full-package scorecard, source-fidelity review, blueprint-quality review, assumption-ledger decisions, and concrete edit-history evidence for each same sample
- At least one complete proof sample uses a real `project.courseMap` fixture from outside the curated built-in gold samples, and that real course-map proof sample is at one of the required `5`, `8`, or `14` lesson scopes
- Complete proof samples cover `5`, `8`, and `14` lesson scopes so strict proof covers short modules, standard courses, and full-semester courses
- At least one proof-eligible external reviewer scorecard covers all six required scorecard dimensions and anchors each score to artifact evidence
- At least one proof-eligible external reviewer scorecard reviewed the full core package, not just a subset of artifacts
- The minimum normalized reviewer score is at least `9/10`
- At least one proof-eligible external source-fidelity review confirms artifact-level source-to-package fidelity for the full core package
- At least one proof-eligible external blueprint-quality review confirms lesson-level source-to-blueprint compression quality
- At least one proof-eligible external assumption-ledger review confirms inferred assumptions and records reviewer decisions for local-confirmation rows
- The normal expert audit has `0` blockers

## Interpreting Results

The audit report includes:

- `Current package version`: the CourseMapper package version that external proof must match
- `External review fixtures`: fixtures marked external
- `External current-version fixtures`: external fixtures whose `reviewEvidence.reviewedPackageVersion` matches the current package version
- `External stale package-version fixtures`: external fixtures that were reviewed against an older or different package version
- `External proof-eligible fixtures`: external fixtures with enough proof metadata
- `External reviewer-proof fixtures`: proof-eligible fixtures with reviewer expectations
- `Reviewer scorecard fixtures`: fixtures with scored external or internal review dimensions
- `External evidence-anchored scorecards`: proof-eligible external scorecards whose dimensions include reviewed artifacts and concrete evidence examples
- `External full-package review scorecards`: proof-eligible external scorecards whose reviewed artifacts cover the full core package
- `External source-fidelity reviews`: proof-eligible external reviews confirming the source course map was compared against the compiled package
- `External source-fidelity artifact reviews`: proof-eligible external reviews with artifact-level source checks for every core compiled artifact
- `External blueprint-quality reviews`: proof-eligible external reviews confirming the source course map was compared against the compact blueprint
- `External blueprint-quality lesson reviews`: proof-eligible external reviews with lesson-level source-to-blueprint checks for every blueprint lesson
- `External assumption-ledger reviews`: proof-eligible external reviews confirming the blueprint assumption ledger was inspected
- `External assumption-ledger decision reviews`: proof-eligible external reviews with concrete reviewer decisions for review-required assumption rows
- `Minimum external reviewer score`: the lowest normalized score among proof-eligible external reviewer scorecards
- `External edit-history fixtures`: proof-eligible fixtures with external instructor edit history and concrete edit evidence
- `External edit-history evidence patterns`: accepted external edit patterns with before/after wording or concrete evidence notes
- `External complete proof samples`: reviewed sample IDs where scorecard, source-fidelity, blueprint-quality, assumption-ledger, and edit-history proof all refer to the same sample
- `External complete proof modalities`: distinct course-modality groups covered by complete proof samples
- `External complete proof scopes`: distinct course lengths covered by complete proof samples
- `Missing external proof scopes`: required course lengths still missing from complete proof samples
- `External complete proof scope tags`: review packet tags such as modality and source-risk coverage for complete proof samples
- `External-project complete proof samples`: complete proof samples compiled from an externally supplied `project.courseMap`
- `External-project required-scope proof`: complete external-project proof samples whose lesson count is one of the required `5`, `8`, or `14` proof scopes
- `Proof status`: whether the current evidence is internal-only, external-review, external-edit, or both
- `External proof required`: whether the stricter A-quality proof mode was enabled
- `External proof readiness`: a checklist of the external review, same-sample proof bundle, edit-history, scorecard, full-package coverage, source-fidelity, blueprint-quality, score-floor, and normal-audit requirements
- `Audit requirement blockers`: release-proof blockers added by the stricter A-quality mode

The goal state for A-quality proof is:

- `Status: pass`
- `Proof status: external-review-and-edit-evidence-present`
- `External current-version fixtures` equals `External review fixtures`
- `External stale package-version fixtures: 0`
- `External complete proof samples: 2` or higher
- `External complete proof modalities: 2` or higher
- `External complete proof scopes: 3` with `5`, `8`, and `14`
- `Missing external proof scopes: none`
- `External-project complete proof samples: 1` or higher
- `External-project required-scope proof: 1` or higher
- `External blueprint-quality reviews: 1` or higher
- `External blueprint-quality lesson reviews: 1` or higher
- `External proof required: yes` when making an A-quality release claim
- `Audit requirement blockers: 0`
- `Blueprint fidelity findings: 0`
- `Blockers: 0`
