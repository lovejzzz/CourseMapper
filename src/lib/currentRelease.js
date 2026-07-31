import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 31, 2026',
  title: 'Fail-Closed Quality Checkpoint',
  landingTitle: 'Scion V0.17.05 Makes Package Quality Proof Fail Closed',
  highlights: [
    'A missing, timed-out, or errored finalize-time grade is now a package blocker: the workspace cannot call the package ready or enable download without quality proof.',
    'Recoverable output remains intact, but a failed ZIP-time grading attempt is not saved as a download; it adds an explicit QUALITY_REPORT.md and manifest readiness blocker for a safe retry.',
    'The outer finalize deadline grants a separate 15-second assembly margin beyond the grader budget, preventing equal nested timers from discarding a valid terminal grade.',
    'Deep grader V1.11.6 scores lesson plans, assignments, and rubrics with ordinary-course sample floors; Trellis now varies its assignment and rubric directions instead of tripping the expanded guard.',
    'Bundle content ceilings remain fixed while a named 64-byte compressor tolerance accounts for measured Node/zlib variation.',
    'This checkpoint certifies deterministic encoded-package checks only. It does not certify factual accuracy, accessibility, teachability, instructor approval, or classroom outcomes.',
  ],
  landingHighlights: [
    'No quality proof means no ready package.',
    'Ungraded ZIPs pause before download.',
    'The grader receives its full deadline.',
    'Three long-form families are repetition-scored.',
    'Compressor variance is separate from growth.',
    'Claims stay inside deterministic evidence.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.05.json',
    roadmap: 'docs/V0.17.05_SCION_CHECKPOINT_AUDIT.md',
    benchmark: 'docs/QUALITY_MEASUREMENT_SETTLEMENT_2026-07-24.md',
    browser: 'src/lib/__tests__/packageExportVerifier.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
