import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 30, 2026',
  title: 'Evidence Before Completeness',
  landingTitle: 'Scion V0.17.01 Prefers Supported Results to Polished Fallbacks',
  highlights: [
    'CourseIR repair no longer assigns the first source-ledger row—or a hard-coded SL1—to unsupported outcomes, activities, examples, assessments, rubric criteria, or synthesized concepts. Missing evidence stays missing instead of becoming complete-looking wiring.',
    'A two-lesson adversarial fixture proves that a source supporting one lesson cannot manufacture coverage for the other. Missing and dangling counts remain visible, and invalid source structure continues through the existing retry/blocking path.',
    'A model-failure Course FAQ is now explicitly draft-review content and cannot pass publishability checks merely because deterministic templates reached the requested count.',
    'Underfilled quizzes remain underfilled and retryable. The post-processor no longer pads them with a rotating set of generic short-answer stems, and validation enforces the configured evidence-bound question count.',
    'Deep grader V1.11.1 masks each lesson title before cross-lesson comparison, catching repeated semantic skeletons that previously evaded exact-line checks through title interpolation.',
    'A new 12-course untuned panel reports 30 lens-default hits across 10 packages alongside 468 clusters and 11.91% reader exposure. This characterizes an unrecognized-course boundary; V0.17.01 does not claim source correctness, provider improvement, factual certification, instructor validation, accessibility certification, or classroom outcomes.',
  ],
  landingHighlights: [
    'Unsupported source links stay missing.',
    'No hard-coded SL1 coverage.',
    'Fallback FAQs stay visibly draft.',
    'Thin quizzes retry instead of padding.',
    'Title-swapped boilerplate is detected.',
    'Untuned courses have their own ruler.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.01.json',
    roadmap: 'docs/V0.17.01_OUTPUT_QUALITY_AUDIT.md',
    benchmark: 'tests/v01701-output-quality.test.js',
    browser: 'src/lib/__tests__/deliverablePostProcess.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
