import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 31, 2026',
  title: 'Lesson-Plan Repetition Guard',
  landingTitle: 'Scion V0.17.04 Adds a Calibrated Lesson-Plan Repetition Guard',
  highlights: [
    'Deep grader V1.11.5 adds a calibrated score-bearing regression guard for reader-visible lesson-plan skeleton repetition instead of leaving that known-bad pattern advisory-only.',
    'The policy seals its exact family, denominator, minimum sample, thresholds, severity, and evidence. Other artifact families remain measured but cannot lower the score until they have their own calibration.',
    'The dominant independent-work instructor sentence now composes from lesson concept, evidence, decision, artifact, and revision context rather than stamping one submission-readiness frame across courses.',
    'The boundary comes from retained output evidence: the current golden package measured 8.16% lesson-plan skeleton excess, while the earlier two-package settlement measured known-bad lesson-plan rates of 16.4–17.0%.',
    'The release improves deterministic output variation and conformance truthfulness. It does not certify factual accuracy, instructional quality, accessibility, instructor approval, or classroom outcomes, and it changes no model weights.',
  ],
  landingHighlights: [
    'Known-bad lesson-plan repetition is guarded.',
    'Every threshold and denominator is visible.',
    'Uncalibrated families remain score-neutral.',
    'Instructor coaching varies with lesson context.',
    'Retained packages calibrate the boundary.',
    'Claims stay inside deterministic evidence.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.04.json',
    roadmap: 'docs/V0.17.04_READER_VISIBLE_TEXTURE_AUDIT.md',
    benchmark: 'trellis/runs/e0-golden/report.json',
    browser: 'src/lib/__tests__/packageExportVerifier.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
