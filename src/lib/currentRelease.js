import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 1, 2026',
  title: 'Truth Before Quality Claims',
  landingTitle: 'EDUTOOL V0.17.07 Stops Calling Proxies Teaching Quality',
  highlights: [
    'Quality receipts are bound to the exact export scope, app, grader, texture policy, course map, theme, and deliverables. A stale or differently scoped seal cannot authorize another ZIP.',
    'Automated Readiness no longer parses pipeline prose or internal source-reference wiring as evidence. Extraction-only receipts remain visible for traceability but earn zero semantic-grounding credit.',
    'The compiler no longer hides repeated model misconceptions by inventing domain-generic replacements. Missing disciplinary definitions and repeated authored shells stay visible as defects or regeneration signals.',
    'Reader-visible repetition, identity leakage, ambiguous table headers, long artifact titles, quiz explanation sameness, and several learner-facing copy defects now have calibrated repairs and regression coverage.',
    'External instructor preflight and the existing Algi/Scion/hybrid evidence benchmark are release-blocking. The benchmark now exits nonzero when evidence has not been recorded instead of reporting a green protocol-only run.',
    'A six-round code-and-artifact Roundtable audit found a real Gemma ceiling but identified the binding demonstrated failure as compiler fan-out plus a self-coupled release loop. V0.17.07 is an engineering-integrity release, not a classroom-quality checkpoint.',
  ],
  landingHighlights: [
    'One ZIP cannot borrow another ZIP’s quality seal.',
    'Extraction is no longer scored as semantic grounding.',
    'Compiler substitutions cannot hide weak model prose.',
    'Formatting and repetition defects stay regression-locked.',
    'Missing human evidence fails the release gate.',
    'The release is honest about what remains unproved.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.07.json',
    roadmap: 'docs/V0.17.07_OUTPUT_QUALITY_ARCHITECTURE_AUDIT.md',
    benchmark: 'evaluation/scion-adapters/held-out-course-benchmark-v40.json',
    browser: 'verification-output/output-quality-checkpoint-v01706/audit-fix-r13',
    auditCommand: 'npm run audit:release-history',
  },
};
