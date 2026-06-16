# CI Quality Policy

_Updated June 16, 2026._

CourseMapper uses two CI signals with different jobs.

## Fast Verification

Fast verification is the normal push gate. It should answer: can this commit ship
without breaking the app?

It runs formatting, lint, release-history audit, the unit and closed-loop suite,
the fast blueprint matrix, deliverable audit, pipeline audit, build, bundle
budgets, and a three-sample gold smoke:

- `gold-research-methods-short-5`
- `gold-ai-course-design-8`
- `gold-community-health-semester-14`

The smoke set covers short, standard, and full-semester scope without turning
every push into the full 40-sample quality lab.

## Deep Proof

Deep proof is the heavy release and quality-intelligence battery. It runs on:

- `workflow_dispatch`
- nightly schedule
- `release/**` branches

It does not run on ordinary `main` pushes.

Deep proof has two lanes:

1. App/runtime gates stay strict everywhere. Build failure, broken export or
   download behavior caught by E2E, Firebase rules failures, bundle-budget
   failure, or package-integrity failure should make GitHub red.
2. Educational-quality gates are strict for manual pre-release checks and
   `release/**` branches, but advisory for scheduled runs.

Nightly educational-quality regressions should upload reports and warnings
without making the repository look broken. Those reports are inputs for the next
quality-improvement pass, not proof that the current deployed app is unusable.

## Reading A Red Run

If Fast verification is red, treat the commit as not ready to push or deploy.

If Deep proof app/runtime gates are red, treat it as a release blocker.

If a scheduled Deep proof quality report has advisory warnings, inspect the
artifact and decide whether it needs an immediate repair, a roadmap item, or a
later quality-loop seed.
