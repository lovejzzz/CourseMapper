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
    'CourseIR repair no longer creates a source ledger, borrows its first row, or assigns a hard-coded SL1 to unsupported semantic atoms. Repair receipts are emitted only when references actually change.',
    'Source recovery stays local: a lesson cannot lend coverage to another, and each rubric criterion can recover only from its linked outcomes and lessons.',
    'Unusable Course FAQ generation now fails closed and remains retryable. CourseMapper neither builds a deterministic fallback artifact nor pads an underfilled FAQ with invented questions.',
    'Quiz retry, readiness, and repair observations all use the configured question target. Underfilled lessons stay visible without being counted as deterministic repairs.',
    'Deep grader V1.11.2 masks every known lesson title in every document with token-safe boundaries, catching title-swapped semantic skeletons without changing words such as database.',
    'A frozen canonical receipt binds the observed 12-course untuned panel: 30 lens-default hits across 10 packages, 468 clusters, and 11.91% reader exposure. These characterize a boundary, not a quality win.',
  ],
  landingHighlights: [
    'Unsupported source links stay missing.',
    'No hard-coded SL1 coverage.',
    'FAQ failures stay failed and retryable.',
    'Configured quiz targets drive retry.',
    'Title-swapped boilerplate is detected.',
    'Untuned figures have a frozen receipt.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.01.json',
    roadmap: 'docs/V0.17.01_OUTPUT_QUALITY_AUDIT.md',
    benchmark: 'tests/v01701-output-quality.test.js',
    browser: 'src/lib/__tests__/deliverablePostProcess.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
