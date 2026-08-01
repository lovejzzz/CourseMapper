import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 31, 2026',
  title: 'Output Quality Checkpoint',
  landingTitle: 'EDUTOOL V0.17.06 Makes the Package Match Its Quality Seal',
  highlights: [
    'ZIP finalization accepts precomputed quality proof only from the current grader. Older proof is regraded instead of preserving a clean but obsolete seal.',
    'Every lesson now publishes an evidence-dependency record, and unresolved assessment evidence becomes a P0 package blocker rather than an aggregate grounding blind spot.',
    'Assignment logistics, malformed learner prose, procedural glossary definitions, and long-course quiz repetition are repaired or rejected before export.',
    'DOCX exports keep semantic rows together, mark true headers, avoid artificial pagination, and render without high-, medium-, or low-severity accessibility findings in the retained checkpoint sample.',
    'PPTX exports keep decorations inside the canvas, identify decorative objects, and use concise complete activity, discussion, bridge, example, and evidence language.',
    'A fresh four-lesson checkpoint package earns 99/A with zero P0, P1, or P2 findings and resolves all eight lesson dependencies. This is deterministic output evidence, not factual, pedagogical, or accessibility certification.',
  ],
  landingHighlights: [
    'Old grader proof is never called current.',
    'Lesson evidence resolves before download.',
    'Learner directions are concrete and complete.',
    'DOCX pagination respects semantic rows.',
    'Slide checks distinguish content from decoration.',
    'The quality claim stays evidence-bounded.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.06.json',
    roadmap: 'docs/V0.17.06_OUTPUT_QUALITY_CHECKPOINT.md',
    benchmark: 'evaluation/scion-adapters/held-out-course-benchmark-v38.json',
    browser: 'src/lib/__tests__/packageZipExporter.test.js',
    auditCommand: 'npm run audit:release-history',
  },
};
