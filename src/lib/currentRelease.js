import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 31, 2026',
  title: 'Actionable Before Clean',
  landingTitle: 'Scion V0.17.03 Makes Clean Mean Actionable',
  highlights: [
    'Newly compiled assignments now carry concrete file, extent, citation, submission, and exception defaults instead of sending learners to configuration that may not exist.',
    'Assignment exports no longer receive a clean content-verification result when learner-facing directions still defer required format, length, or citation rules. Deep grader V1.11.4 makes the same defect a score-bearing P1 finding.',
    'The detector is deliberately narrow: a real historical package was used to reject broad rules that would have mislabeled concrete course-site or late-policy language as missing configuration.',
    'The code-only Roundtable finding was independently reproduced across the 132-course compiler matrix. A regrade of the retained World Literature package also exposed and closed duplicate comparative-paper findings, so one artifact defect is penalized once.',
    'The release strengthens deterministic output review and report truthfulness. It does not certify factual accuracy, instructional quality, accessibility, instructor approval, or classroom outcomes, and it changes no model weights.',
  ],
  landingHighlights: [
    'New assignments include concrete submission defaults.',
    'Format, length, and citation deferrals are score-bearing.',
    'One artifact defect is counted once.',
    'Real output calibrated the rule boundary.',
    'Broad policy language is not over-flagged.',
    'Claims stay inside deterministic evidence.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.03.json',
    roadmap: 'docs/V0.17.03_OUTPUT_TRUTH_AUDIT.md',
    benchmark: 'src/lib/quality/__tests__/deepQualityStructure.test.js',
    browser: 'src/lib/__tests__/packageExportVerifier.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
